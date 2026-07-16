"""
Structured field extractor for Indian GST tax invoices.

Improvements over v1:
  • Expanded COLUMN_SYNONYMS covering 60+ header variants seen on real invoices
  • Multi-line description merging — items whose name wraps across rows are joined
  • Column position inference — X-coordinate clustering for tables with no header row
  • IMEI / serial-number row linking — 15-digit orphan rows attached to previous item
  • Aggressive noise-row filtering — tax, total, discount, narration rows stripped
  • Two-pass table extraction — HTML (high confidence) → row-grid (fallback)
  • Wider footer window (55 % of page) to capture totals on short invoices
  • Samsung device parsing — "Batch : 15-digit" → IMEI, model code → color + storage
  • Device-specific fields — imei, model_code, color, storage on ExtractedLineItem
"""

import re
import logging
from collections import defaultdict
from html.parser import HTMLParser
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from .models import (
    ExtractedField, ExtractedLineItem, InvoiceExtractionResult,
)
from .device_schemas import detect_schema, DeviceSchema

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
#  Synonym / label maps
# ══════════════════════════════════════════════════════════════════════════════

LABEL_SYNONYMS: Dict[str, List[str]] = {
    "invoice_number": [
        "invoice no", "invoice number", "inv no", "inv#", "invoice#",
        "bill no", "bill number", "bill#", "receipt no", "receipt number",
        "voucher no", "doc no", "document no", "ref no", "challan no",
        "memo no", "tax invoice no", "order no", "sr no", "serial no",
        "sale order no", "so no", "delivery note no", "dn no",
    ],
    "invoice_date": [
        "invoice date", "bill date", "date", "dated", "dt",
        "invoice dt", "bill dt", "transaction date", "doc date",
        "challan date", "sale date", "order date",
    ],
    "due_date": [
        "due date", "payment due", "pay by", "due by", "expiry date",
        "validity", "valid till",
    ],
    "payment_terms": [
        "payment terms", "terms", "terms of payment", "credit days",
        "payment mode", "mode of payment", "payment method",
    ],
    "vendor_name": [
        # Only use unambiguous seller-side labels here.
        # Generic terms like "company"/"firm"/"from" are intentionally omitted
        # because they also appear in buyer ("Bill To") sections.
        "sold by", "seller", "vendor", "supplier", "dealer",
        "distributor", "manufacturer", "m/s", "billed by", "ship from",
        "dispatched by", "dispatched from", "consignor",
    ],
    "vendor_gstin": [
        "gstin", "gst no", "gst number", "gst reg no", "gst registration",
        "gstin no", "gstin:", "dealer gstin", "seller gstin",
        "our gstin", "tin no", "vat no", "cst no", "gstin/uin",
    ],
    "vendor_phone": [
        "phone", "mobile", "tel", "telephone", "contact",
        "mob", "ph", "cell", "ph no", "mobile no", "contact no",
        "helpline", "customer care",
    ],
    "vendor_address": [
        "address", "addr", "location", "place", "registered address",
        "business address", "office", "ship from", "billing address",
    ],
    "vendor_email": [
        "email", "e-mail", "mail", "email id", "email address",
    ],
    "subtotal": [
        "subtotal", "sub total", "sub-total", "taxable value",
        "basic amount", "amount before tax", "taxable amount",
        "assessable value", "gross amount", "taxable val",
        "total before tax", "value of goods", "total value",
    ],
    "cgst": [
        "cgst", "central gst", "central tax", "cgst amount", "cgst @",
        "central goods and services tax",
    ],
    "sgst": [
        "sgst", "state gst", "state tax", "sgst amount", "sgst @",
        "utgst", "ut gst", "state goods and services tax",
    ],
    "igst": [
        "igst", "integrated gst", "integrated tax", "igst amount", "igst @",
        "integrated goods and services tax",
    ],
    "tax_amount": [
        "total tax", "tax amount", "gst amount", "total gst",
        "taxes", "vat amount", "total tax amount", "total duties",
    ],
    "total_amount": [
        "grand total", "total amount", "net amount", "amount payable",
        "total payable", "net payable", "invoice total", "bill total",
        "total due", "balance due", "final amount", "net total",
        "amount due", "net bill amount", "payable amount",
        "total invoice value", "net invoice value", "total (inr)",
        "invoice value", "net value", "final bill", "total bill amount",
    ],
}

COLUMN_SYNONYMS: Dict[str, List[str]] = {
    "description": [
        "description", "particulars", "product", "item", "name",
        "product name", "item description", "goods", "details",
        "product details", "article", "item name", "material",
        "item / particulars", "products / services", "service",
        "nature of goods", "product & description", "item details",
        "goods / services", "narration", "specification",
    ],
    "quantity": [
        # "no" removed — it's 2 chars and matches "SI No." / "Sl. No." serial-number
        # headers before the real Quantity column is processed.
        "qty", "quantity", "nos", "pcs", "units",
        "number", "count", "no of units", "qnty", "qty.",
        "no. of pcs", "pieces", "nos.", "unit", "qty (nos)",
    ],
    "unit_price": [
        "unit price", "rate", "price", "unit rate", "mrp",
        "basic price", "selling price", "sp", "purchase price", "pp",
        "per unit", "u/p", "unit cost", "cost price", "rate/unit",
        "price/unit", "unit value", "basic rate", "sale price",
        "list price", "net rate", "rate (rs.)", "price (rs.)",
    ],
    "amount": [
        "amount", "total", "value", "net amount", "line total",
        "total amount", "ext price", "net value", "taxable value",
        "gross amount", "total value", "amt", "amount (rs.)",
        "line amount", "item total", "basic amount",
    ],
    "hsn_code": [
        "hsn", "hsn code", "hsn/sac", "sac", "hsn no",
        "hsn code no", "tariff code", "hsn sac", "hsn/sac code",
        "hs code", "sac/hsn", "commodity code",
    ],
    "tax_rate": [
        "gst %", "gst rate", "gst", "tax %", "tax rate",
        "igst %", "cgst %", "sgst %", "vat %", "tax", "rate %",
        "gst%", "tax%", "gst (@)", "rate of tax", "tax slab",
    ],
    "discount": [
        "discount", "disc", "disc%", "discount %", "discount amount",
        "less discount", "trade discount",
    ],
    "serial_number": [
        "s.no", "s. no", "sno", "sr", "sr no", "sr.", "#",
        "sl no", "sl.no", "serial no", "item no", "no.",
        "seq", "sequence",
        # Samsung / common Indian invoice variants:
        "si no", "si no.", "sl. no", "sl. no.", "s no", "s no.",
    ],
}

# ── Buyer-section boundary detection ─────────────────────────────────────────
# When any of these phrases appear in a text line, everything from that line
# onwards is the buyer/consignee section — NOT the seller's information.
BUYER_SECTION_RE = re.compile(
    r"\b(bill(?:ed)?\s+to|ship(?:ped)?\s+to|delivery\s+(?:to|address)"
    r"|buyer(?:'s)?\s+(?:detail|name|info|address)?"
    r"|purchaser|consignee|recipient|sold\s+to|customer(?:'s)?\s+detail"
    r"|party\s+detail|client\s+detail)\b",
    re.IGNORECASE,
)

# Keywords that disqualify a line from being the seller company name
VENDOR_NAME_EXCLUDE_KW = frozenset([
    "invoice", "bill", "receipt", "tax", "gst", "original", "duplicate",
    "triplicate", "copy", "buyer", "purchaser", "customer", "consignee",
    "ship to", "bill to", "billed to", "cin", "pan", "date", "no.",
    "number", "state", "pin", "gstin", "address", "phone", "mob",
    "tel", "email", "fax", "www", "http", "thank", "proforma",
    "estimate", "quotation", "credit note", "debit note",
])

# Rows whose description matches any of these are noise (not products)
NOISE_ROW_PATTERNS = re.compile(
    r"^("
    r"(sub\s*total|subtotal|total|grand\s*total|net\s*(total|amount|payable)"
    r"|amount\s*(payable|due)|balance\s*due|invoice\s*total)"
    r"|(c|s|i)gst\s*[@\d]"
    r"|(total\s*)?(c|s|i)gst"
    r"|tax\s*(amount|total|@)"
    r"|discount|round\s*(off|up|down)"
    r"|freight|shipping|delivery\s*charges?"
    r"|narration|remarks|note"
    r"|packaging|handling\s*charges?"
    r"|adjustment|advance\s*(paid|received)"
    r"|balance\s*(due|payable)"
    r")\s*$",
    re.IGNORECASE,
)

# OCR amount pattern
AMOUNT_RE = re.compile(r"(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)")

# Regex patterns
GSTIN_RE  = re.compile(r"\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]\b", re.IGNORECASE)
PHONE_RE  = re.compile(r"\b(?:\+91[\s\-]?)?[6-9]\d{9}\b")
EMAIL_RE  = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
IMEI_RE   = re.compile(r"\b(\d{15})\b")
DATE_RES  = [
    re.compile(r"\b(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2,4})\b"),
    re.compile(
        r"\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
        r"[a-z]*[\s,]+(\d{4})\b",
        re.IGNORECASE,
    ),
]

# ── Samsung / device-invoice specific patterns ────────────────────────────────

# Samsung model code: SM-A125FZKGINS, SM-M366BZKDINS, etc.
# group 1 = full model code (SM-XXXX variant+country suffix)
# group 2 = base code (SM-XXXX)
# group 3 = color+variant letters between base and country suffix
# group 4 = country suffix (INS / IND / ILL / ODS / ODD)
SAMSUNG_MODEL_RE = re.compile(
    r"\b(SM-([A-Z]\d{3,4}[A-Z0-9]?)([A-Z]{2,4})?(INS|IND|ILL|ODS|ODD|ILA)?)\b",
    re.IGNORECASE,
)

# RAM / Storage: "8/128", "6/256", "12/512"
SAMSUNG_RAM_STORAGE_RE = re.compile(r"\b(\d+)\s*/\s*(\d+)\b")

# Samsung "Batch" IMEI line: "Batch : 354931771185210" or "Batch# 354931771185210"
SAMSUNG_BATCH_RE = re.compile(
    r"\bBatch\s*[:#\.]\s*(\d{15})\b",
    re.IGNORECASE,
)

# Lines that are noise in a Samsung device description (continuation rows to strip
# from the cleaned description but still parse before stripping)
SAMSUNG_NOISE_SUFFIXES = re.compile(
    r"\b(without\s+(?:adaptor|charger|box|cable|earphone)"
    r"|w/o\s+(?:adaptor|charger|box)"
    r"|excl\.?\s+(?:adaptor|charger)"
    r"|no\s+(?:adaptor|charger))\b",
    re.IGNORECASE,
)

# Map first letter of Samsung color-variant code → likely color name.
# The color code is the first letter of the variant substring (after the base model).
# e.g. SM-A125F[Z]KD INS → Z → Menthol/Green
# This is a best-effort heuristic; the explicit color word in the description wins.
SAMSUNG_COLOR_CODE_MAP: Dict[str, str] = {
    "Z": "Menthol",
    "K": "Black",
    "W": "White",
    "S": "Silver",
    "B": "Blue",
    "R": "Red",
    "Y": "Yellow",
    "G": "Green",
    "L": "Lavender",
    "N": "Navy",
    "V": "Violet",
    "P": "Purple",
    "T": "Teal",
    "O": "Orange",
    "C": "Copper",
    "E": "Graphite",
    "F": "Fantasia",
}


# ══════════════════════════════════════════════════════════════════════════════
#  HTML table parser
# ══════════════════════════════════════════════════════════════════════════════

class _HTMLTableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows: List[List[str]] = []
        self._cur_row:  List[str] = []
        self._cur_cell: str = ""
        self._in_cell:  bool = False

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._cur_row = []
        elif tag in ("td", "th"):
            self._cur_cell = ""
            self._in_cell  = True

    def handle_endtag(self, tag):
        if tag in ("td", "th"):
            self._cur_row.append(self._cur_cell.strip())
            self._in_cell = False
        elif tag == "tr" and self._cur_row:
            self.rows.append(self._cur_row)

    def handle_data(self, data):
        if self._in_cell:
            self._cur_cell += data


# ══════════════════════════════════════════════════════════════════════════════
#  Main extractor
# ══════════════════════════════════════════════════════════════════════════════

TextBlock  = Dict
TableBlock = Dict
LineItem   = ExtractedLineItem


class FieldExtractor:
    # Active brand schema for the current extraction run.
    # Set once in extract() after scanning flat lines for model codes.
    # All sub-methods read self._active_schema so no schema needs to be
    # threaded through every call signature.
    _active_schema: Optional[DeviceSchema] = None

    def extract(
        self,
        text_blocks: List[TextBlock],
        table_blocks: List[TableBlock],
    ) -> InvoiceExtractionResult:
        r = InvoiceExtractionResult()

        lines = self._flat_lines(text_blocks)
        full_text = "\n".join(t for t, _, _ in lines)

        # Auto-detect brand schema from model codes in the full text.
        # This drives schema-specific column synonyms, IMEI patterns, fuzzy
        # color matching, and noise stripping throughout the extraction run.
        self._active_schema = detect_schema(full_text)
        if self._active_schema:
            logger.info("Brand schema: %s", self._active_schema.brand)
        else:
            logger.info("Brand schema: none (generic extraction)")

        self._extract_header(lines, full_text, r)
        r.line_items = self._extract_items(table_blocks, lines)
        self._extract_totals(lines, full_text, r)
        self._compute_quality(r)

        return r

    # ── Header extraction ─────────────────────────────────────────────────────

    def _extract_header(
        self,
        lines: List[Tuple[str, float, int]],
        full_text: str,
        r: InvoiceExtractionResult,
    ) -> None:
        # ── Step 0: Split into seller section vs buyer section ────────────────
        # Indian invoices always list seller info first, then a "Bill To:" /
        # "Ship To:" section for the buyer.  Once we see a buyer-section marker,
        # everything below it belongs to the buyer and must NOT be used for
        # vendor name / GSTIN / phone extraction.
        buyer_boundary = len(lines)
        for i, (text, _, _) in enumerate(lines):
            if BUYER_SECTION_RE.search(text):
                buyer_boundary = i
                break

        seller_lines = lines[:buyer_boundary]
        # Safety net: if boundary is suspiciously early (< 3 lines), use all
        if buyer_boundary < 3:
            seller_lines = lines

        # ── Step 1: GSTIN — take the first one in the seller section ─────────
        # (Buyer GSTIN appears after the "Bill To:" boundary)
        for text, conf, _ in seller_lines:
            m = GSTIN_RE.search(text.upper())
            if m:
                r.vendor_gstin = ExtractedField(
                    value=m.group(0).upper(), confidence=0.97
                )
                break
        if not r.vendor_gstin.value:
            # Fallback: first GSTIN anywhere (lower confidence)
            m = GSTIN_RE.search(full_text.upper())
            if m:
                r.vendor_gstin = ExtractedField(
                    value=m.group(0).upper(), confidence=0.88
                )

        # ── Step 2: Phone & email — seller section only ───────────────────────
        seller_text = "\n".join(t for t, _, _ in seller_lines) or full_text
        m = PHONE_RE.search(seller_text)
        if m:
            phone = re.sub(r"[^\d+]", "", m.group(0))
            if phone.startswith("91") and len(phone) == 12:
                phone = phone[2:]
            r.vendor_phone = ExtractedField(value=phone, confidence=0.93)

        m = EMAIL_RE.search(seller_text)
        if m:
            r.vendor_email = ExtractedField(value=m.group(0).lower(), confidence=0.95)

        # ── Step 3: Invoice date — scan all lines ─────────────────────────────
        if not r.invoice_date.value:
            for text, conf, _ in lines:
                for pat in DATE_RES:
                    dm = pat.search(text)
                    if dm:
                        r.invoice_date = ExtractedField(
                            value=self._norm_date(dm.group(0)),
                            confidence=min(conf * 0.92, 1.0),
                        )
                        break
                if r.invoice_date.value:
                    break

        # ── Step 4: Label-based extraction (all non-total fields) ────────────
        # For vendor-specific fields, restrict search to seller section.
        # For invoice meta (invoice_number, dates, payment terms) scan all lines.
        VENDOR_FIELDS = {"vendor_name", "vendor_gstin", "vendor_phone",
                         "vendor_address", "vendor_email"}
        SKIP_TOTALS   = {"subtotal", "cgst", "sgst", "igst", "tax_amount", "total_amount"}

        for field, syns in LABEL_SYNONYMS.items():
            if field in SKIP_TOTALS:
                continue
            cur = getattr(r, field, None)
            if cur and cur.value:
                continue
            search_lines = seller_lines if field in VENDOR_FIELDS else lines
            for i, (text, conf, _) in enumerate(search_lines):
                tl = text.lower()
                for syn in syns:
                    if syn in tl:
                        val = self._inline_value(text, syn)
                        val_conf = conf
                        if not val and i + 1 < len(search_lines):
                            val      = search_lines[i + 1][0].strip()
                            val_conf = search_lines[i + 1][1]
                        if val:
                            self._set(r, field, val, val_conf * 0.88)
                        break
                if getattr(r, field, None) and getattr(r, field).value:
                    break

        # ── Step 5: Vendor name heuristic (if label scan failed) ─────────────
        #
        # Strategy A — GSTIN proximity
        # The seller's company name almost always appears 1–4 lines ABOVE
        # their GSTIN on the invoice letterhead.  Walk backwards from the
        # GSTIN line to find the first meaningful text line.
        if not r.vendor_name.value and r.vendor_gstin.value:
            gstin_idx = None
            for i, (text, _, _) in enumerate(seller_lines):
                if r.vendor_gstin.value in text.upper():
                    gstin_idx = i
                    break
            if gstin_idx is not None and gstin_idx > 0:
                window = seller_lines[max(0, gstin_idx - 5): gstin_idx]
                for text, conf, _ in reversed(window):
                    tl = text.lower().strip()
                    if (len(text) > 3
                            and not PHONE_RE.search(text)
                            and not EMAIL_RE.search(text)
                            and not re.match(r"^\d", text.strip())
                            and not any(kw in tl for kw in VENDOR_NAME_EXCLUDE_KW)):
                        r.vendor_name = ExtractedField(
                            value=text.strip(),
                            confidence=min(conf * 0.90, 0.95),
                        )
                        break

        # Strategy B — first clean line in seller section (top of letterhead)
        if not r.vendor_name.value:
            # Limit to the first 8 lines of the seller section
            for text, conf, _ in seller_lines[:8]:
                tl = text.lower().strip()
                if (len(text) > 3
                        and not GSTIN_RE.search(text.upper())
                        and not PHONE_RE.search(text)
                        and not EMAIL_RE.search(text)
                        and not re.match(r"^\d", text.strip())
                        and not BUYER_SECTION_RE.search(text)
                        and not any(kw in tl for kw in VENDOR_NAME_EXCLUDE_KW)):
                    r.vendor_name = ExtractedField(
                        value=text.strip(),
                        confidence=max(conf * 0.75, 0.55),
                        needs_review=conf < 0.8,
                    )
                    break

        # ── Step 6: Vendor address — lines with digits in seller section ──────
        if not r.vendor_address.value:
            addr = []
            name_val = r.vendor_name.value or ""
            for text, _, _ in seller_lines[1:8]:
                if (text.strip() == name_val
                        or GSTIN_RE.search(text.upper())
                        or PHONE_RE.search(text)):
                    continue
                if re.search(r"\d", text) and len(text) > 10:
                    addr.append(text.strip())
            if addr:
                r.vendor_address = ExtractedField(
                    value=", ".join(addr[:3]), confidence=0.62, needs_review=True
                )

    # ── Totals extraction ─────────────────────────────────────────────────────

    def _extract_totals(
        self,
        lines: List[Tuple[str, float, int]],
        full_text: str,
        r: InvoiceExtractionResult,
    ) -> None:
        # Wider footer window: 55% of page (catches totals on short invoices)
        footer = lines[int(len(lines) * 0.55):]

        for text, conf, _ in footer:
            tl = text.lower()
            for field in ("subtotal", "cgst", "sgst", "igst", "tax_amount", "total_amount"):
                cur = getattr(r, field, None)
                if cur and cur.value:
                    continue
                for syn in LABEL_SYNONYMS.get(field, []):
                    if syn in tl:
                        val = self._extract_amount(text)
                        if val:
                            self._set(r, field, val, conf * 0.87)
                        break

        if not r.total_amount.value:
            m = re.search(
                r"(?:grand\s+total|total\s+amount|net\s+payable|amount\s+payable|"
                r"total\s+payable|invoice\s+total|bill\s+total)"
                r"[:\s₹Rs.]*"
                r"([\d,]+(?:\.\d{1,2})?)",
                full_text, re.IGNORECASE,
            )
            if m:
                r.total_amount = ExtractedField(
                    value=self._clean_amount(m.group(1)), confidence=0.88
                )

    # ── Line-item extraction ──────────────────────────────────────────────────

    def _extract_items(
        self,
        table_blocks: List[TableBlock],
        flat_lines: List[Tuple[str, float, int]],
    ) -> List[LineItem]:
        items: List[LineItem] = []

        # Priority order for table extraction:
        #   1. HTML table from PP-Structure (highest structural confidence)
        #   2. Spatial-clustered rows (coordinate-math based, always available)
        #   3. Inferred rows (Y-alignment fallback)
        #   4. Strategy B flat-line scan (Samsung model code scan)
        html_items:    List[LineItem] = []
        spatial_items: List[LineItem] = []
        inferred_items: List[LineItem] = []

        for tb in table_blocks:
            tb_type = tb.get("type", "")

            if "html" in tb:
                # PP-Structure HTML table
                html_items.extend(self._parse_html(tb["html"]))

            elif "rows" in tb:
                if tb_type == "spatial":
                    # Spatial table: rows are already column-aligned, use directly.
                    # _all_rows == rows for spatial tables (set intentionally equal).
                    spatial_items.extend(self._parse_rows(tb["rows"]))

                else:
                    # Inferred / other table: _all_rows includes single-cell
                    # continuation rows that were filtered out of rows[].
                    all_rows = tb.get("_all_rows") or tb["rows"]
                    inferred_items.extend(self._parse_rows(all_rows))

        # Use best available result
        if len(html_items) >= 1:
            items = html_items
            logger.debug("Using HTML table: %d items", len(items))
        elif len(spatial_items) >= 1:
            items = spatial_items
            logger.debug("Using spatial table: %d items", len(items))
        elif len(inferred_items) >= 1:
            items = inferred_items
            logger.debug("Using inferred table: %d items", len(items))
        else:
            # Last resort: flat-line scan (Strategy A + B in _infer_items)
            items = self._infer_items(flat_lines)
            logger.debug("Using flat-line inference: %d items", len(items))

        items = self._merge_multiline_items(items)
        items = self._link_imei_rows(items, flat_lines)
        items = self._parse_device_fields(items)
        items = [i for i in items if not self._is_noise_item(i)]

        # ── Safety net: Samsung/device flat-line fallback ─────────────────────
        # If ALL table-based paths produced 0 real items (either because the table
        # was empty or every row was a noise/total row), try the flat-line device
        # scan (Strategy B in _infer_items) as a last resort.
        # This ensures Samsung model codes in the raw text are never missed.
        if not items:
            logger.info(
                "0 items after table extraction + noise filter — "
                "running flat-line Samsung/device scan"
            )
            fallback = self._infer_items(flat_lines)
            fallback = self._merge_multiline_items(fallback)
            fallback = self._link_imei_rows(fallback, flat_lines)
            fallback = self._parse_device_fields(fallback)
            fallback = [i for i in fallback if not self._is_noise_item(i)]
            if fallback:
                logger.info("Flat-line fallback recovered %d item(s)", len(fallback))
                items = fallback
            else:
                logger.warning(
                    "All extraction strategies exhausted — "
                    "returning empty item list (check /debug/last for details)"
                )

        return items[:50]

    def _parse_html(self, html: str) -> List[LineItem]:
        p = _HTMLTableParser()
        p.feed(html)
        if not p.rows:
            return []
        header   = [c.lower().strip() for c in p.rows[0]]
        col_map  = self._map_cols(header, schema=self._active_schema)
        if "description" not in col_map:
            # Try every row as potential header until we find column matches
            for row in p.rows[1:3]:
                alt_header = [c.lower().strip() for c in row]
                alt_map    = self._map_cols(alt_header)
                if len(alt_map) >= 2:
                    col_map = alt_map
                    p.rows  = p.rows[p.rows.index(list(row)):]
                    break
        items = []
        for row in p.rows[1:]:
            item = self._row_to_item(row, col_map, conf=0.88)
            if item:
                items.append(item)
        return items

    def _parse_rows(self, rows: List[List[TextBlock]]) -> List[LineItem]:
        if not rows:
            return []
        header  = [b.get("text", "").lower() for b in rows[0]]
        col_map = self._map_cols(header, schema=self._active_schema)

        # If header matching failed, try X-position inference
        if "description" not in col_map and len(rows) >= 2:
            col_map = self._infer_columns_by_position(rows)

        items = []
        start = 1 if col_map.get("_from_header", True) else 0
        for row in rows[start:]:
            cells = [b.get("text", "") for b in row]
            conf  = min((b.get("confidence", 0.5) for b in row), default=0.5)
            item  = self._row_to_item(cells, col_map, conf=conf)
            if item:
                items.append(item)
        return items

    def _infer_items(self, lines: List[Tuple[str, float, int]]) -> List[LineItem]:
        """
        Last-resort extractor — two strategies:

        Strategy A (generic): lines whose last token is a number → price on same line.
        Strategy B (Samsung / device): detect SM-XXXX model codes and group the
          surrounding lines (continuation rows, Batch:, price) into one item.
          Works when PP-Structure and _infer_table both fail on a camera photo.
        """
        items: List[LineItem] = []

        # ── Strategy B: device model code scan ───────────────────────────────
        # Use the active brand schema's model regex when available; fall back to
        # the hardcoded Samsung pattern so existing behaviour is preserved when
        # no schema is detected (mixed invoices, unknown brands).
        schema = self._active_schema
        _model_re = schema._model_re if schema else SAMSUNG_MODEL_RE
        _imei_fn  = schema.find_imei if schema else None

        pending_device: Optional[ExtractedLineItem] = None
        pending_conf:   float = 0.0

        for text, conf, y in lines:
            # Check for brand model code (schema-aware)
            mm = _model_re.search(text)
            if mm:
                # Commit any in-progress device
                if pending_device and pending_device.description.value:
                    items.append(pending_device)
                pending_device = ExtractedLineItem(
                    description=ExtractedField(
                        value=text.strip(), confidence=conf * 0.80, needs_review=True
                    )
                )
                pending_conf = conf
                continue

            if pending_device:
                tl = text.strip().lower()
                # Batch/IMEI line → will be picked up by _parse_device_fields later
                bm = SAMSUNG_BATCH_RE.search(text)
                if bm:
                    pending_device.description.value += " " + text.strip()
                    continue
                # Continuation text (without Adaptor, etc.)
                if SAMSUNG_NOISE_SUFFIXES.search(text):
                    pending_device.description.value += " " + text.strip()
                    continue
                # Price line — must have a decimal point (e.g. "21490.00")
                # to distinguish from quantity ("1") or HSN code ("85800000").
                am = re.fullmatch(r"[\d,]+\.\d{1,2}", text.strip())
                if am and not pending_device.unit_price.value:
                    pending_device.unit_price = ExtractedField(
                        value=self._clean_amount(text.strip()),
                        confidence=conf * 0.75, needs_review=True,
                    )
                    continue
                # Standalone IMEI
                if IMEI_RE.fullmatch(text.strip()):
                    pending_device.description.value += f" [IMEI: {text.strip()}]"
                    continue

        if pending_device and pending_device.description.value:
            items.append(pending_device)

        if items:
            return items

        # ── Strategy A: generic price-at-end-of-line heuristic ───────────────
        skip_kw = {
            "total", "gst", "tax", "date", "invoice", "gstin", "subtotal",
            "cgst", "sgst", "igst", "discount", "round", "freight",
            "shipping", "narration", "receipt", "advance", "balance",
            "packaging", "handling",
        }
        for text, conf, _ in lines:
            tl = text.lower().strip()
            if any(kw in tl for kw in skip_kw):
                continue
            if NOISE_ROW_PATTERNS.search(tl):
                continue
            parts = text.split()
            if len(parts) >= 3 and re.match(r"[\d,]+(?:\.\d{1,2})?$", parts[-1]):
                desc  = " ".join(parts[:-1])
                price = self._clean_amount(parts[-1])
                if len(desc) > 3 and price:
                    items.append(ExtractedLineItem(
                        description=ExtractedField(value=desc, confidence=conf * 0.55, needs_review=True),
                        unit_price=ExtractedField(value=price, confidence=conf * 0.55, needs_review=True),
                    ))
        return items

    # ── Post-processing ───────────────────────────────────────────────────────

    def _merge_multiline_items(self, items: List[LineItem]) -> List[LineItem]:
        """
        Join consecutive items where the description wraps to a new row.
        A continuation row has a description but all numeric fields are empty.
        """
        if len(items) < 2:
            return items
        merged: List[LineItem] = []
        for item in items:
            is_continuation = (
                item.description.value
                and not item.quantity.value
                and not item.unit_price.value
                and not item.amount.value
            )
            if is_continuation and merged:
                prev = merged[-1]
                prev.description.value = (
                    prev.description.value + " " + item.description.value
                ).strip()
                prev.description.confidence = min(
                    prev.description.confidence, item.description.confidence
                )
            else:
                merged.append(item)
        return merged

    def _link_imei_rows(
        self, items: List[LineItem], flat_lines: List[Tuple[str, float, int]]
    ) -> List[LineItem]:
        """
        Some invoices list IMEI numbers as standalone rows below the product.
        Handles two formats:
          • Bare 15-digit line:          "354931771185210"
          • Label prefix line:           "Batch : 354931771185210"
            (label variants come from the active brand schema, fallback to
             the hardcoded SAMSUNG_BATCH_RE for backward compatibility)

        The IMEI is appended as "[IMEI: xxx]" so _parse_device_fields() can
        extract it into the dedicated imei field later.
        """
        schema = self._active_schema
        imei_candidates: List[Tuple[str, int]] = []
        for text, _, y in flat_lines:
            stripped = text.strip()
            # Bare 15-digit line
            if IMEI_RE.fullmatch(stripped):
                imei_candidates.append((stripped, y))
                continue
            # Schema-aware labelled IMEI line ("Batch : 15digits", etc.)
            if schema:
                found = schema.find_imei(stripped)
                if found:
                    imei_candidates.append((found, y))
                    continue
            # Hardcoded Samsung "Batch : 15digits" fallback
            bm = SAMSUNG_BATCH_RE.search(stripped)
            if bm:
                imei_candidates.append((bm.group(1), y))

        if not imei_candidates or not items:
            return items

        for imei_text, _ in imei_candidates:
            for item in reversed(items):
                if item.description.value and not IMEI_RE.search(item.description.value):
                    item.description.value = (
                        item.description.value + f" [IMEI: {imei_text}]"
                    )
                    break
        return items

    def _is_noise_item(self, item: LineItem) -> bool:
        """Return True for rows that are totals/taxes, not products."""
        desc = item.description.value.strip().lower()
        if not desc:
            return True
        if NOISE_ROW_PATTERNS.search(desc):
            return True
        # Broader GST component filter: "CGST @ 9%", "CGST 9%", "IGST @18%" etc.
        # NOISE_ROW_PATTERNS catches "CGST@9" but misses "CGST @ 9%" (space + %).
        if re.match(r"^(?:c|s|i)gst\b", desc, re.IGNORECASE):
            return True
        # Rows that are just a number (serial number with no desc)
        if re.match(r"^\d{1,3}\.?\s*$", desc):
            return True
        # Standalone quantity annotation — "1 PCS", "2 NOS", "1 Nos." etc.
        # These appear when the table Quantity cell wraps to a new visual line
        # and PaddleOCR reads it as a separate text block. They are NOT device items.
        if re.match(r"^\d+\s*(pcs?|pieces?|nos?\.?|units?)\s*$", desc, re.IGNORECASE):
            return True
        return False

    # ── Device-specific field extraction ─────────────────────────────────────

    def _parse_device_fields(self, items: List[LineItem]) -> List[LineItem]:
        """
        Post-processing pass that enriches each item with device-specific
        structured fields (IMEI, model_code, color, storage).

        When a brand schema is active (self._active_schema is set), uses the
        schema's regex and fuzzy-color-matching helpers so that OCR garbling
        like "BIuo" → "Blue" and "Goid" → "Gold" is corrected automatically.

        Falls back to the hardcoded Samsung patterns when no schema is active.
        """
        schema = self._active_schema

        for item in items:
            desc = item.description.value
            if not desc:
                continue

            conf = item.description.confidence

            # ── IMEI ─────────────────────────────────────────────────────────
            if not item.imei.value:
                # 1. [IMEI: xxx] tag (added by _link_imei_rows)
                tag_m = re.search(r"\[IMEI:\s*(\d{15})\]", desc, re.IGNORECASE)
                if tag_m:
                    item.imei = ExtractedField(
                        value=tag_m.group(1), confidence=min(conf * 0.97, 1.0)
                    )
                    desc = (desc[:tag_m.start()] + desc[tag_m.end():]).strip(" ,-")
                else:
                    # 2. Schema-aware labelled IMEI ("Batch : …", "IMEI No : …")
                    imei_val = None
                    if schema:
                        imei_val = schema.find_imei(desc)
                        if imei_val:
                            # Strip the matched label+digits from description
                            # (re-run the schema regex to get match position)
                            imei_m = schema._imei_re.search(desc)
                            if imei_m:
                                desc = (
                                    desc[:imei_m.start()] + desc[imei_m.end():]
                                ).strip()
                    if not imei_val:
                        # 3. Hardcoded Samsung "Batch : 15digits" fallback
                        bm = SAMSUNG_BATCH_RE.search(desc)
                        if bm:
                            imei_val = bm.group(1)
                            desc = (
                                desc[:bm.start()] + desc[bm.end():]
                            ).strip()
                    if not imei_val:
                        # 4. Bare 15-digit anywhere in description
                        im = IMEI_RE.search(desc)
                        if im:
                            imei_val = im.group(1)
                            desc = desc.replace(im.group(0), "").strip(" ,-")
                    if imei_val:
                        item.imei = ExtractedField(
                            value=imei_val, confidence=min(conf * 0.97, 1.0)
                        )

            # ── Model code ───────────────────────────────────────────────────
            if not item.model_code.value:
                model_code = None
                if schema:
                    model_code = schema.find_model(desc)
                if not model_code:
                    # Hardcoded Samsung fallback
                    mm = SAMSUNG_MODEL_RE.search(desc)
                    if mm:
                        model_code = mm.group(1).upper()
                        # Also attempt color from the color-variant letter code
                        # (e.g. "ZKD" in SM-A125FZKDINS → Z → Menthol)
                        # Only use as low-confidence hint; explicit word wins below.
                        if not item.color.value:
                            color_letters = mm.group(3) or ""
                            if color_letters:
                                first_letter = color_letters[0].upper()
                                guessed = SAMSUNG_COLOR_CODE_MAP.get(first_letter, "")
                                if guessed:
                                    item.color = ExtractedField(
                                        value=guessed, confidence=0.55, needs_review=True
                                    )
                if model_code:
                    item.model_code = ExtractedField(
                        value=model_code.upper(), confidence=min(conf * 0.95, 1.0)
                    )

            # ── Storage ──────────────────────────────────────────────────────
            if not item.storage.value:
                storage_val = schema.find_storage(desc) if schema else None
                if not storage_val:
                    sm = SAMSUNG_RAM_STORAGE_RE.search(desc)
                    if sm:
                        storage_val = f"{sm.group(2)}GB"
                if storage_val:
                    item.storage = ExtractedField(
                        value=storage_val, confidence=min(conf * 0.90, 1.0)
                    )

            # ── Color — schema-driven fuzzy OCR correction ───────────────────
            # When a schema is available, use its color vocabulary + fuzzy
            # matching to correct "BIuo" → "Blue", "Goid" → "Gold", etc.
            # Falls back to hardcoded regex for unknown brands.
            if not item.color.value or item.color.needs_review:
                if schema:
                    corrected = schema.extract_color_from_desc(desc)
                    if corrected:
                        item.color = ExtractedField(
                            value=corrected,
                            confidence=min(conf * 0.93, 1.0),
                            needs_review=False,
                        )
                        logger.debug(
                            "Color extracted (schema): '%s'", corrected
                        )

                if not item.color.value or item.color.needs_review:
                    # Hardcoded fallback for non-schema paths
                    color_m = re.search(
                        r"\b(\d+\s*/\s*\d+)\s+"
                        r"(Black|White|Blue|Green|Red|Gold|Silver|Gray|Grey|Purple|"
                        r"Yellow|Orange|Pink|Violet|Lavender|Navy|Teal|Copper|Graphite|"
                        r"Menthol|Jade|Olive|Aqua|Mint|Sage|Phantom|Mystique|Awesome)\b",
                        desc, re.IGNORECASE,
                    )
                    if color_m:
                        item.color = ExtractedField(
                            value=color_m.group(2).title(),
                            confidence=min(conf * 0.93, 1.0),
                            needs_review=False,
                        )

            # ── Strip noise from description ──────────────────────────────────
            # Use schema noise markers when available; fall back to hardcoded regex.
            if schema:
                clean_desc = schema.strip_noise(desc)
            else:
                clean_desc = SAMSUNG_NOISE_SUFFIXES.sub("", desc)

            # Common cleanups regardless of schema:
            # Remove "[IMEI: ...]" tags (already extracted above)
            clean_desc = re.sub(r"\[IMEI:\s*\d{15}\]", "", clean_desc, flags=re.IGNORECASE)
            # Remove orphan "Batch :" remnants
            clean_desc = re.sub(r"\bBatch\s*[:#\.]\s*\d*\s*$", "", clean_desc, flags=re.IGNORECASE)
            # Remove quantity-unit annotations that merged in ("1 PCS", "2 NOS")
            clean_desc = re.sub(
                r"\s+\d+\s*(pcs?|pieces?|nos?\.?|units?)\b",
                "", clean_desc, flags=re.IGNORECASE,
            )
            clean_desc = re.sub(r"\s{2,}", " ", clean_desc).strip(" ,-.")

            if clean_desc and clean_desc != desc:
                item.description.value = clean_desc

        return items

    # ── Column header → field mapping ─────────────────────────────────────────

    # Words that disqualify a column for unit_price mapping.
    # "Rate (Incl. of Tax)" / "Rate (Inc. Tax)" are MRP columns — we want
    # the pure "Rate" (taxable value) column for unit_price instead.
    _UNIT_PRICE_EXCL = frozenset({"incl", "incl.", "inclusive", "inc.", "including"})

    def _map_cols(
        self,
        header: List[str],
        schema: Optional[DeviceSchema] = None,
    ) -> Dict[str, int]:
        """
        Map column header strings to field names.

        When a brand schema with invoice_columns is supplied, uses the schema's
        preferred column synonym lists (e.g. Samsung: "quantity" never matches
        "no" so it can't steal the "SI No." serial column).

        Falls back to the generic COLUMN_SYNONYMS for unknown brands.
        """
        col_map: Dict[str, int] = {"_from_header": True}

        # Build synonym table for this run
        if schema and schema.invoice_columns:
            sc = schema.invoice_columns
            run_synonyms: Dict[str, List[str]] = {
                "description":   sc.description,
                "quantity":      sc.quantity,
                "unit_price":    sc.unit_price,
                "amount":        sc.amount,
                "hsn_code":      sc.hsn_code,
                "serial_number": sc.serial_no,
                # tax_rate + discount keep the generic synonyms (not brand-specific)
                "tax_rate":  COLUMN_SYNONYMS.get("tax_rate", []),
                "discount":  COLUMN_SYNONYMS.get("discount", []),
            }
            excl_words = frozenset(sc.unit_price_exclude)
        else:
            run_synonyms = COLUMN_SYNONYMS
            excl_words   = self._UNIT_PRICE_EXCL

        for i, cell in enumerate(header):
            cl = cell.lower().strip()
            for field, syns in run_synonyms.items():
                if field in col_map:
                    continue
                # Skip columns whose header contains exclusion words for unit_price
                # e.g. "Rate (Incl. of Tax)" → skip so pure "Rate" column wins.
                if field == "unit_price" and any(ex in cl for ex in excl_words):
                    continue
                if any(s in cl for s in syns):
                    col_map[field] = i

        if "description" not in col_map and header:
            col_map["description"] = 0
        return col_map

    def _infer_columns_by_position(
        self, rows: List[List[TextBlock]]
    ) -> Dict[str, int]:
        """
        When header row matching fails, cluster columns by X-position.
        Heuristics:
          - Leftmost column with long text → description
          - Rightmost numeric column → amount
          - Second-rightmost numeric column → unit_price
          - Short numeric column near left → quantity
        """
        if not rows:
            return {"description": 0, "_from_header": False}

        # Count columns in the median row
        col_counts = [len(r) for r in rows]
        n_cols = sorted(col_counts)[len(col_counts) // 2]
        if n_cols < 2:
            return {"description": 0, "_from_header": False}

        # Collect X-centres per column index
        x_centres: Dict[int, List[float]] = defaultdict(list)
        numeric_ratio: Dict[int, float] = defaultdict(float)

        for row in rows:
            for ci, block in enumerate(row[:n_cols]):
                bb = block.get("bbox", [[0, 0]])
                x = (bb[0][0] + bb[2][0]) / 2 if len(bb) >= 3 else bb[0][0]
                x_centres[ci].append(x)
                text = block.get("text", "")
                if re.search(r"\d", text):
                    numeric_ratio[ci] = numeric_ratio.get(ci, 0) + 1

        total_rows = len(rows)
        for ci in numeric_ratio:
            numeric_ratio[ci] /= total_rows

        sorted_cols = sorted(x_centres.keys())
        col_map: Dict[str, int] = {"_from_header": False}

        # Description → leftmost column (skip pure serial-number column)
        for ci in sorted_cols:
            if numeric_ratio.get(ci, 0) < 0.5:
                col_map["description"] = ci
                break
        if "description" not in col_map:
            col_map["description"] = sorted_cols[0]

        # Amount → rightmost numeric column
        for ci in reversed(sorted_cols):
            if numeric_ratio.get(ci, 0) >= 0.5 and ci != col_map["description"]:
                col_map["amount"] = ci
                break

        # Unit price → second-rightmost numeric column
        amt_ci = col_map.get("amount", -1)
        for ci in reversed(sorted_cols):
            if (numeric_ratio.get(ci, 0) >= 0.5
                    and ci != col_map["description"]
                    and ci != amt_ci):
                col_map["unit_price"] = ci
                break

        # Quantity → short numeric column to the right of description
        desc_ci = col_map["description"]
        for ci in sorted_cols:
            if (ci > desc_ci
                    and numeric_ratio.get(ci, 0) >= 0.5
                    and ci != col_map.get("amount")
                    and ci != col_map.get("unit_price")):
                col_map["quantity"] = ci
                break

        return col_map

    def _row_to_item(
        self, cells: List[str], col_map: Dict[str, int], conf: float
    ) -> Optional[LineItem]:
        def get(f: str) -> str:
            idx = col_map.get(f)
            return str(cells[idx]).strip() if idx is not None and idx < len(cells) else ""

        desc = get("description")

        # ── Single-cell continuation row fallback ─────────────────────────────
        # Handles two cases:
        #   (a) Row has exactly 1 cell (inferred/HTML tables)
        #   (b) Spatial tables pad single-cell rows to n_cols with empty blocks,
        #       e.g. "without Adaptor" → ["without Adaptor", "", "", "", ""].
        #       len(cells) is n_cols (e.g. 5), not 1 — the old len==1 check misses it.
        # Detect (b): cells[0] has content AND every other cell is empty.
        if not desc:
            cells_str = [str(c).strip() for c in cells]
            if len(cells_str) == 1 and cells_str[0]:
                desc = cells_str[0]
            elif cells_str and cells_str[0] and all(not c for c in cells_str[1:]):
                # Padded spatial continuation row — content only in cells[0]
                desc = cells_str[0]

        if not desc or len(desc) < 2:
            return None

        # Skip serial-number-only descriptions (e.g. "1", "2.", "S.No")
        if re.match(r"^(\d{1,3}\.?\s*|s\.?\s*no\.?)$", desc.strip(), re.IGNORECASE):
            return None

        dl = desc.lower()
        if NOISE_ROW_PATTERNS.search(dl):
            return None
        if any(kw in dl for kw in ["description", "particulars", "product name", "item name"]):
            return None

        # Extract IMEI embedded in description (15-digit, or "[IMEI: xxx]" tag,
        # or "Batch : xxx" from Samsung invoices).
        #
        # Key rule: if extracting the IMEI would leave desc EMPTY (i.e. the
        # entire row was just "Batch : 354931771185210"), we keep desc intact
        # instead of clearing it.  This lets _merge_multiline_items() absorb
        # the Batch row into the preceding device item as a continuation row,
        # and then _parse_device_fields() will extract the IMEI from the merged
        # description.  This avoids a Y-coordinate lookup in _link_imei_rows().
        imei_val = ""
        _desc_before_imei = desc   # save original in case extraction leaves desc empty

        # Check for [IMEI: xxx] tag first (added by _link_imei_rows)
        imei_tag_m = re.search(r"\[IMEI:\s*(\d{15})\]", desc, re.IGNORECASE)
        if imei_tag_m:
            imei_val  = imei_tag_m.group(1)
            cleaned   = desc[:imei_tag_m.start()].strip() + desc[imei_tag_m.end():].strip()
            desc      = cleaned.strip(" ,-") or _desc_before_imei
        else:
            # Raw 15-digit or "Batch : 15-digit"
            batch_m = SAMSUNG_BATCH_RE.search(desc)
            if batch_m:
                imei_val = batch_m.group(1)
                cleaned  = (desc[:batch_m.start()].strip() + " " + desc[batch_m.end():].strip()).strip()
                # If nothing is left after stripping the Batch text, keep the
                # original Batch line — merge will absorb it, parse_device_fields
                # will extract the IMEI from it.
                desc = cleaned if cleaned else _desc_before_imei
            else:
                imei_m = IMEI_RE.search(desc)
                if imei_m:
                    imei_val = imei_m.group(1)
                    cleaned  = desc.replace(imei_m.group(0), "").strip(" ,-")
                    desc     = cleaned if cleaned else _desc_before_imei

        qty    = self._clean_num(get("quantity"))
        uprice = self._clean_amount(get("unit_price"))
        amt    = self._clean_amount(get("amount"))
        hsn    = get("hsn_code")
        tax    = get("tax_rate")

        def f(v: str, boost: float = 1.0) -> ExtractedField:
            return ExtractedField(
                value=v,
                confidence=min(conf * boost, 1.0),
                needs_review=not v or conf * boost < 0.7,
            )

        return ExtractedLineItem(
            description=f(desc),
            quantity=f(qty, 0.95),
            unit_price=f(uprice, 0.95),
            amount=f(amt, 0.93),
            hsn_code=f(hsn, 0.90),
            tax_rate=f(tax, 0.90),
            imei=f(imei_val, 0.97) if imei_val else ExtractedField(),
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _flat_lines(self, blocks: List[TextBlock]) -> List[Tuple[str, float, int]]:
        lines = []
        for b in blocks:
            text = b.get("text", "").strip()
            conf = float(b.get("confidence", 0.5))
            bbox = b.get("bbox", [[0, 0]])
            y    = int(bbox[0][1]) if bbox else 0
            if text:
                lines.append((text, conf, y))
        return sorted(lines, key=lambda x: x[2])

    def _inline_value(self, text: str, label: str) -> str:
        pat = re.compile(re.escape(label) + r"[:\-\s#.]+(.+)$", re.IGNORECASE)
        m   = pat.search(text.lower())
        if m:
            return text[m.start(1):].strip()
        return ""

    def _extract_amount(self, text: str) -> str:
        matches = AMOUNT_RE.findall(text)
        return self._clean_amount(matches[-1]) if matches else ""

    def _clean_amount(self, s: str) -> str:
        if not s:
            return ""
        # Strip currency symbol / prefix, then thousands-separator commas.
        # IMPORTANT: do NOT strip '.' — it is the decimal separator.
        # Old regex [₹Rs.\s] accidentally stripped '.' inside the char class.
        s = re.sub(r"(?:₹|Rs\.?)\s*", "", s.strip(), flags=re.IGNORECASE)
        s = re.sub(r"\s+", "", s)   # remove remaining whitespace
        s = s.replace(",", "")      # remove thousands commas (e.g. 1,21,490.00)
        try:
            return f"{float(s):.2f}"
        except ValueError:
            return s

    def _clean_num(self, s: str) -> str:
        if not s:
            return ""
        m = re.search(r"(\d+(?:\.\d+)?)", s)
        return m.group(1) if m else s

    def _norm_date(self, s: str) -> str:
        for pat in DATE_RES:
            m = pat.search(s)
            if m:
                try:
                    g = m.groups()
                    if re.match(r"[A-Za-z]", str(g[1])):
                        dt = datetime.strptime(f"{g[0]} {g[1]} {g[2]}", "%d %b %Y")
                        return dt.strftime("%d/%m/%Y")
                    d, mo, y = int(g[0]), int(g[1]), g[2]
                    y = y if len(str(y)) == 4 else "20" + str(y)
                    return f"{d:02d}/{mo:02d}/{y}"
                except Exception:
                    pass
        return s

    def _set(
        self,
        r: InvoiceExtractionResult,
        field: str,
        value: str,
        confidence: float,
    ) -> None:
        cur = getattr(r, field, None)
        if cur is None or not cur.value or cur.confidence < confidence:
            setattr(r, field, ExtractedField(
                value=value.strip(),
                confidence=min(confidence, 1.0),
                needs_review=confidence < 0.7,
            ))

    def _compute_quality(self, r: InvoiceExtractionResult) -> None:
        key_fields = [
            r.vendor_name, r.vendor_gstin, r.vendor_phone,
            r.invoice_number, r.invoice_date,
            r.subtotal, r.total_amount,
        ]
        scores = [f.confidence for f in key_fields if f.value]
        for li in r.line_items:
            if li.description.value:
                scores.append(li.description.confidence)

        r.overall_confidence   = sum(scores) / len(scores) if scores else 0.0
        r.low_confidence_count = sum(1 for f in key_fields if f.value and f.confidence < 0.7)
