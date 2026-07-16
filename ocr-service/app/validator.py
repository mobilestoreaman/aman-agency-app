"""
Post-extraction validation and confidence re-scoring for Indian GST invoices.

Validators:
  • GSTIN:   15-char format + state code + position-wise OCR auto-correction
  • Phone:   10 digits, starts 6-9
  • Date:    DD/MM/YYYY normalisation
  • Amount:  0 to 10 crore sanity range
  • HSN:     4-8 digit numeric
  • Cross-validate: subtotal + tax ≈ grand total (2 % tolerance) → confidence boost

OCR auto-correction:
  Common confusions: 0↔O, 1↔I, 5↔S, 8↔B, 6↔G, 2↔Z
  Applied position-specifically — GSTIN positions 1-2 must be digits,
  positions 3-7 must be letters, etc.
"""

import re
import logging
from typing import Optional, Tuple

from .models import ExtractedField, InvoiceExtractionResult

logger = logging.getLogger(__name__)


# ── Indian state code registry (2-digit numeric prefix of GSTIN) ─────────────

VALID_STATE_CODES = {
    "01", "02", "03", "04", "05", "06", "07", "08", "09",
    "10", "11", "12", "13", "14", "15", "16", "17", "18",
    "19", "20", "21", "22", "23", "24", "25", "26", "27",
    "28", "29", "30", "31", "32", "33", "34", "35", "36",
    "37", "38", "97", "99",  # 97 = Other Territory, 99 = Centre Jurisdiction
}

# ── GSTIN structure:  DD LLLLL NNNN L N Z C  (D=digit, L=letter, N=alphanum, C=alphanum)
#    position index:   01 23456 7890 A B C D  (0-indexed, 14 chars total)
#    positions that MUST be digits:  0,1,7,8,9,10,11
#    positions that MUST be letters: 2,3,4,5,6,12
#    position 13 (check digit):      alphanumeric
#    position 12 (alphabet check):   always 'Z' in current scheme
GSTIN_DIGIT_POS  = {0, 1, 7, 8, 9, 10, 11}
GSTIN_LETTER_POS = {2, 3, 4, 5, 6, 12}
GSTIN_Z_POS      = {13}   # must be 'Z'

OCR_DIGIT_FIX  = {"O": "0", "I": "1", "S": "5", "B": "8", "G": "6", "Z": "2", "l": "1"}
OCR_LETTER_FIX = {"0": "O", "1": "I", "5": "S", "8": "B", "6": "G", "2": "Z"}

GSTIN_RE = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]$")


# ══════════════════════════════════════════════════════════════════════════════

class Validator:

    def validate(self, r: InvoiceExtractionResult) -> InvoiceExtractionResult:
        """Validate and potentially auto-correct fields in place."""
        r.vendor_gstin   = self._validate_gstin(r.vendor_gstin)
        r.vendor_phone   = self._validate_phone(r.vendor_phone)
        r.invoice_date   = self._validate_date(r.invoice_date)
        r.due_date       = self._validate_date(r.due_date)
        r.subtotal       = self._validate_amount(r.subtotal)
        r.cgst           = self._validate_amount(r.cgst)
        r.sgst           = self._validate_amount(r.sgst)
        r.igst           = self._validate_amount(r.igst)
        r.tax_amount     = self._validate_amount(r.tax_amount)
        r.total_amount   = self._validate_amount(r.total_amount)

        for item in r.line_items:
            item.unit_price = self._validate_amount(item.unit_price)
            item.amount     = self._validate_amount(item.amount)
            item.hsn_code   = self._validate_hsn(item.hsn_code)
            item.quantity   = self._validate_quantity(item.quantity)

        self._cross_validate(r)
        self._recompute_overall(r)
        return r

    # ── GSTIN ─────────────────────────────────────────────────────────────────

    def _validate_gstin(self, f: ExtractedField) -> ExtractedField:
        if not f.value:
            return f

        raw = f.value.upper().strip().replace(" ", "").replace("-", "")

        # Auto-correct using position rules
        corrected = self._auto_correct_gstin(raw)

        if GSTIN_RE.match(corrected):
            state = corrected[:2]
            if state in VALID_STATE_CODES:
                return ExtractedField(
                    value=corrected,
                    confidence=min(f.confidence + 0.05, 0.98),
                    needs_review=False,
                )
            else:
                return ExtractedField(
                    value=corrected,
                    confidence=min(f.confidence, 0.60),
                    needs_review=True,
                )
        else:
            # Flag as needing review but keep the extracted value
            return ExtractedField(
                value=raw,
                confidence=max(f.confidence - 0.25, 0.10),
                needs_review=True,
            )

    def _auto_correct_gstin(self, s: str) -> str:
        if len(s) != 15:
            return s
        result = list(s)
        for i, ch in enumerate(result):
            if i in GSTIN_DIGIT_POS:
                result[i] = OCR_DIGIT_FIX.get(ch, ch)
            elif i in GSTIN_LETTER_POS:
                result[i] = OCR_LETTER_FIX.get(ch, ch)
            elif i in GSTIN_Z_POS:
                result[i] = "Z"
        return "".join(result)

    # ── Phone ─────────────────────────────────────────────────────────────────

    def _validate_phone(self, f: ExtractedField) -> ExtractedField:
        if not f.value:
            return f
        digits = re.sub(r"\D", "", f.value)
        # Strip country code
        if digits.startswith("91") and len(digits) == 12:
            digits = digits[2:]
        if len(digits) == 10 and digits[0] in "6789":
            return ExtractedField(
                value=digits,
                confidence=min(f.confidence + 0.05, 0.97),
                needs_review=False,
            )
        return ExtractedField(
            value=f.value,
            confidence=max(f.confidence - 0.20, 0.10),
            needs_review=True,
        )

    # ── Date normalisation ────────────────────────────────────────────────────

    _DATE_PATTERNS = [
        # DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
        re.compile(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$"),
        # DD/MM/YY (2-digit year)
        re.compile(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$"),
        # YYYY-MM-DD (ISO)
        re.compile(r"^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$"),
        # Month name: "12 Jan 2024"
        re.compile(
            r"^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
            r"[a-z]*[\s,]+(\d{4})$",
            re.IGNORECASE,
        ),
    ]
    _MONTHS = {
        "jan": "01", "feb": "02", "mar": "03", "apr": "04",
        "may": "05", "jun": "06", "jul": "07", "aug": "08",
        "sep": "09", "oct": "10", "nov": "11", "dec": "12",
    }

    def _validate_date(self, f: ExtractedField) -> ExtractedField:
        if not f.value:
            return f
        normalised = self._normalise_date(f.value.strip())
        if normalised and normalised != f.value:
            return ExtractedField(
                value=normalised,
                confidence=min(f.confidence + 0.03, 0.97),
                needs_review=False,
            )
        if normalised:
            return f  # already valid
        return ExtractedField(value=f.value, confidence=max(f.confidence - 0.15, 0.10), needs_review=True)

    def _normalise_date(self, s: str) -> Optional[str]:
        for pat in self._DATE_PATTERNS:
            m = pat.match(s)
            if not m:
                continue
            g = m.groups()
            # Month-name variant
            if re.match(r"[A-Za-z]", str(g[1])):
                d   = int(g[0])
                mo  = self._MONTHS.get(g[1].lower()[:3], "00")
                y   = int(g[2])
                return f"{d:02d}/{mo}/{y:04d}"
            # ISO variant: YYYY-MM-DD
            if len(g[0]) == 4:
                y, mo, d = int(g[0]), int(g[1]), int(g[2])
                return f"{d:02d}/{mo:02d}/{y:04d}"
            # Standard DD/MM/YY or DD/MM/YYYY
            d, mo, y = int(g[0]), int(g[1]), g[2]
            y = "20" + y if len(str(y)) == 2 else str(y)
            if 1 <= d <= 31 and 1 <= mo <= 12:
                return f"{d:02d}/{mo:02d}/{y}"
        return None

    # ── Amount ────────────────────────────────────────────────────────────────

    MAX_AMOUNT = 1_00_00_000.0  # 1 crore

    def _validate_amount(self, f: ExtractedField) -> ExtractedField:
        if not f.value:
            return f
        # Strip currency symbols, whitespace, commas — but NOT the decimal point '.'
        cleaned = re.sub(r"(?:₹|Rs\.?)\s*", "", f.value.strip(), flags=re.IGNORECASE)
        cleaned = re.sub(r"[\s,]", "", cleaned)
        # OCR fix: O→0
        cleaned = cleaned.replace("O", "0").replace("o", "0")
        try:
            val = float(cleaned)
        except ValueError:
            return ExtractedField(value=f.value, confidence=max(f.confidence - 0.20, 0.05), needs_review=True)
        if val < 0 or val > self.MAX_AMOUNT:
            return ExtractedField(value=f"{val:.2f}", confidence=max(f.confidence - 0.30, 0.05), needs_review=True)
        return ExtractedField(value=f"{val:.2f}", confidence=f.confidence, needs_review=f.needs_review)

    # ── HSN code ──────────────────────────────────────────────────────────────

    def _validate_hsn(self, f: ExtractedField) -> ExtractedField:
        if not f.value:
            return f
        digits = re.sub(r"\D", "", f.value)
        if 4 <= len(digits) <= 8:
            return ExtractedField(value=digits, confidence=min(f.confidence + 0.03, 0.96), needs_review=False)
        return ExtractedField(value=f.value, confidence=max(f.confidence - 0.15, 0.10), needs_review=True)

    # ── Quantity ──────────────────────────────────────────────────────────────

    def _validate_quantity(self, f: ExtractedField) -> ExtractedField:
        if not f.value:
            return f
        m = re.search(r"(\d+(?:\.\d+)?)", f.value)
        if m:
            return ExtractedField(value=m.group(1), confidence=f.confidence, needs_review=f.needs_review)
        return f

    # ── Cross-validation ──────────────────────────────────────────────────────

    def _cross_validate(self, r: InvoiceExtractionResult) -> None:
        """
        Check:  subtotal + tax_amount ≈ total_amount  (within 2 %)
        If true → boost confidence on all three totals.
        If false → flag them for review.
        """
        sub   = self._to_float(r.subtotal)
        tax   = self._to_float(r.tax_amount)
        total = self._to_float(r.total_amount)

        # Try summing CGST+SGST+IGST if tax_amount is absent
        if tax is None:
            cgst = self._to_float(r.cgst)
            sgst = self._to_float(r.sgst)
            igst = self._to_float(r.igst)
            parts = [v for v in (cgst, sgst, igst) if v is not None]
            tax = sum(parts) if parts else None

        if sub is not None and tax is not None and total is not None:
            computed = sub + tax
            diff     = abs(computed - total)
            tol      = max(total * 0.02, 1.0)   # 2 % or ₹1

            if diff <= tol:
                # Consistent → boost all three
                for f in (r.subtotal, r.tax_amount, r.total_amount):
                    if f.value:
                        f.confidence = min(f.confidence + 0.08, 0.99)
                        f.needs_review = False
                logger.debug("Cross-validation passed: %.2f + %.2f ≈ %.2f", sub, tax, total)
            else:
                # Inconsistent → flag
                for f in (r.subtotal, r.tax_amount, r.total_amount):
                    if f.value:
                        f.confidence = max(f.confidence - 0.10, 0.10)
                        f.needs_review = True
                logger.warning(
                    "Cross-validation failed: %.2f + %.2f = %.2f but extracted total = %.2f",
                    sub, tax, computed, total,
                )

        # Line-item sum vs total
        if total is not None and r.line_items:
            item_sum = 0.0
            for li in r.line_items:
                v = self._to_float(li.amount)
                if v is not None:
                    item_sum += v
            if item_sum > 0:
                diff = abs(item_sum - total)
                tol  = max(total * 0.05, 1.0)  # 5 % tolerance for line items
                if diff <= tol:
                    r.total_amount.confidence = min(r.total_amount.confidence + 0.05, 0.99)
                    logger.debug("Line-item sum %.2f ≈ total %.2f — confidence boosted", item_sum, total)

    # ── Quality re-computation ────────────────────────────────────────────────

    def _recompute_overall(self, r: InvoiceExtractionResult) -> None:
        key_fields = [
            r.vendor_name, r.vendor_gstin, r.vendor_phone,
            r.invoice_number, r.invoice_date,
            r.subtotal, r.total_amount,
        ]
        scores = [f.confidence for f in key_fields if f.value]
        for li in r.line_items:
            if li.description.value:
                scores.append(li.description.confidence)

        r.overall_confidence   = round(sum(scores) / len(scores), 4) if scores else 0.0
        r.low_confidence_count = sum(1 for f in key_fields if f.value and f.confidence < 0.70)

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _to_float(f: ExtractedField) -> Optional[float]:
        if not f.value:
            return None
        try:
            return float(re.sub(r"[^\d.]", "", f.value))
        except (ValueError, TypeError):
            return None
