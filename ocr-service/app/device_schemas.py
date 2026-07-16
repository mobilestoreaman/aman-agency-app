"""
Configurable device extraction schemas for the OCR pipeline.

Each DeviceSchema tells the engine exactly how to find and parse device-specific
fields for a given brand/invoice format:

  model_pattern    — regex that identifies this brand's model codes
  imei_labels      — text labels printed before the IMEI/serial on the invoice
  colors           — authoritative list of valid color names for this brand;
                     used for fuzzy OCR correction ("BIuo" → "Blue")
  storage_pattern  — regex to extract RAM/Storage from description
  noise_markers    — phrases to strip from cleaned description
  invoice_columns  — preferred column header terms on this brand's invoices;
                     overrides the generic COLUMN_SYNONYMS in extractor.py

To add support for a new brand (Apple, Xiaomi, OnePlus …), define a new
DeviceSchema below and add it to DEVICE_SCHEMAS.
"""

import re
import logging
from dataclasses import dataclass, field
from difflib import get_close_matches
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
#  Schema data classes
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class InvoiceColumnConfig:
    """
    Per-brand preferred column header synonyms.

    Use these instead of the generic COLUMN_SYNONYMS when an invoice is
    identified as belonging to a specific brand.  This lets you suppress
    ambiguous short synonyms (e.g. "no" for Samsung SI-No. invoices) and
    prefer exact terms ("rate" not "rate (incl. of tax)").
    """
    description:        List[str]
    quantity:           List[str]
    unit_price:         List[str]
    unit_price_exclude: List[str]   # headers containing these words are SKIPPED
    amount:             List[str]
    hsn_code:           List[str]
    serial_no:          List[str]


@dataclass
class DeviceSchema:
    """
    Everything the extractor needs to handle one brand's devices and invoices.

    Fields
    ------
    brand             Display name ("Samsung", "Apple", …)
    model_pattern     Raw regex matching this brand's model codes (compiled on init)
    imei_labels       Labels printed before the IMEI/serial, e.g. ["Batch", "IMEI"]
    imei_digits       Length of the serial/IMEI number (default 15 for GSM IMEI)
    colors            Canonical color names → enables fuzzy OCR correction
    color_cutoff      Minimum similarity for fuzzy color matching (0–1, default 0.72)
    storage_pattern   Regex with two capture groups: group(1)=RAM, group(2)=Storage
    noise_markers     Phrases to strip from cleaned description
    invoice_columns   Optional: overrides generic column synonyms for this brand
    """
    brand:           str
    model_pattern:   str
    imei_labels:     List[str]
    imei_digits:     int          = 15
    colors:          List[str]    = field(default_factory=list)
    color_cutoff:    float        = 0.72
    storage_pattern: str          = r"(\d+)\s*/\s*(\d+)"
    noise_markers:   List[str]    = field(default_factory=list)
    invoice_columns: Optional[InvoiceColumnConfig] = None

    def __post_init__(self):
        self._model_re = re.compile(self.model_pattern, re.IGNORECASE)
        # Build a single IMEI regex from all label variants
        lbl = "|".join(re.escape(l) for l in self.imei_labels)
        self._imei_re = re.compile(
            rf"\b(?:{lbl})\s*[:#\.\s]\s*(\d{{{self.imei_digits}}})\b",
            re.IGNORECASE,
        )
        self._storage_re = re.compile(self.storage_pattern)
        self._noise_re   = re.compile(
            "|".join(re.escape(m) for m in self.noise_markers),
            re.IGNORECASE,
        ) if self.noise_markers else None

    # ── Public helpers ────────────────────────────────────────────────────────

    def find_model(self, text: str) -> Optional[str]:
        """Return the first model code found in text, uppercased."""
        m = self._model_re.search(text)
        return m.group(0).upper() if m else None

    def find_imei(self, text: str) -> Optional[str]:
        """Return the first IMEI/serial found after a label, e.g. 'Batch : 354931771185210'."""
        m = self._imei_re.search(text)
        return m.group(1) if m else None

    def find_storage(self, text: str) -> Optional[str]:
        """Return storage as '128GB' from pattern like '8/128'."""
        m = self._storage_re.search(text)
        return f"{m.group(2)}GB" if m else None

    def find_ram(self, text: str) -> Optional[str]:
        """Return RAM as '8GB' from pattern like '8/128'."""
        m = self._storage_re.search(text)
        return f"{m.group(1)}GB" if m else None

    # OCR character confusion map: translate common OCR errors BEFORE fuzzy
    # matching so that 'I' (uppercase I) and 'l' (lowercase L) don't count as
    # different characters when scoring similarity.
    #   I  → l   (BIuo → Bluo → Blue ✓)
    #   0  → o   (G0ld → Gold ✓)
    #   1  → l   (B1ack → Black ✓)
    _OCR_CHAR_SUBS = str.maketrans({"I": "l", "0": "o", "1": "l"})

    def correct_color(self, raw: str) -> Optional[str]:
        """
        Fuzzy-match raw OCR text to a known color name.

        Two-stage matching to handle common PaddleOCR character substitutions:

        Stage 1 — direct case-insensitive match:
          "Gold" == "Gold" → "Gold"  (exact, fast)

        Stage 2 — OCR-normalized fuzzy match:
          Apply _OCR_CHAR_SUBS to both the query and the color list, then run
          difflib.get_close_matches on the normalized strings.  The original
          (un-normalized) color is returned, so "BIuo" yields "Blue" not "Blue".

          Common corrections:
            'I' (uppercase-I) → 'l'  :  BIuo → Blue,  BIack → Black
            '0' (zero)        → 'o'  :  G0ld → Gold
            '1' (one)         → 'l'  :  B1ack → Black

        Returns the corrected color string, or None if no close match found.
        """
        if not raw or not self.colors:
            return None
        raw_clean = raw.strip(".,;:()")
        if not raw_clean:
            return None

        # Stage 1: direct case-insensitive match
        for c in self.colors:
            if c.lower() == raw_clean.lower():
                return c

        # Stage 2: OCR-normalized fuzzy match
        # Normalize both sides so difflib sees 'l' for uppercase-I substitutions
        raw_norm    = raw_clean.translate(self._OCR_CHAR_SUBS).lower()
        color_norms = [c.lower().translate(self._OCR_CHAR_SUBS) for c in self.colors]
        norm_matches = get_close_matches(raw_norm, color_norms, n=1, cutoff=self.color_cutoff)
        if norm_matches:
            idx = color_norms.index(norm_matches[0])
            matched = self.colors[idx]
            logger.debug(
                "Color OCR correction (normalized): '%s' → '%s'", raw_clean, matched
            )
            return matched

        return None

    def extract_color_from_desc(self, text: str) -> Optional[str]:
        """
        Extract and OCR-correct the color from a device description.

        Strategy: find the storage pattern (e.g. '8/128'), then try up to 3
        words after it as a color candidate (handles 'Light Gray', 'Phantom Black').
        Falls back to scanning all words in the description.
        """
        storage_m = self._storage_re.search(text)
        if storage_m:
            after = text[storage_m.end():].strip()
            words = after.split()
            # Try longest match first: 3-word → 2-word → 1-word
            for n in range(min(3, len(words)), 0, -1):
                candidate = " ".join(words[:n]).strip(".,;:()")
                corrected = self.correct_color(candidate)
                if corrected:
                    return corrected

        # Fallback: scan every word (and bigram/trigram) in the description
        words = text.split()
        for n in (3, 2, 1):
            for i in range(len(words) - n + 1):
                candidate = " ".join(words[i:i + n]).strip(".,;:()")
                if len(candidate) < 3:
                    continue
                corrected = self.correct_color(candidate)
                if corrected:
                    return corrected
        return None

    def strip_noise(self, text: str) -> str:
        """Remove noise marker phrases from a description."""
        if self._noise_re:
            text = self._noise_re.sub("", text)
        return re.sub(r"\s{2,}", " ", text).strip()

    def matches(self, text: str) -> bool:
        """Return True if this schema's model code appears anywhere in text."""
        return bool(self._model_re.search(text))


# ══════════════════════════════════════════════════════════════════════════════
#  Samsung India schema
# ══════════════════════════════════════════════════════════════════════════════

SAMSUNG_SCHEMA = DeviceSchema(
    brand="Samsung",

    # Model code: SM-G991B, SM-A176BZALINS, SM-M366BZKDINS, SM-A155FZWGINS …
    model_pattern=(
        r"\bSM-"
        r"[A-Z]\d{3,4}[A-Z0-9]?"          # base: SM-A155F, SM-G991B, SM-M366B
        r"(?:[A-Z]{2,4})?"                 # color/variant suffix: ZKD, ZAL, ZAM
        r"(?:INS|IND|ILL|ODS|ODD|ILA)?"   # country suffix
        r"\b"
    ),

    # IMEI / serial formats found on Samsung India invoices:
    #   "Batch : 354931771185210"
    #   "IMEI No : 354931771185210"
    #   "S/N : 354931771185210"
    imei_labels=["Batch", "IMEI No", "IMEI", "Serial No", "S/N"],
    imei_digits=15,

    # Canonical Samsung color names — used for fuzzy OCR correction.
    # Add new colors here as they appear on invoices you receive.
    colors=[
        # Basic
        "Black", "Blue", "Gold", "Silver", "White", "Green",
        "Gray", "Grey", "Red", "Purple", "Violet", "Teal",
        "Navy", "Copper", "Graphite", "Lavender", "Orange",
        "Pink", "Yellow", "Brown", "Beige", "Cream", "Rose",
        # Compound
        "Light Blue", "Light Gray", "Light Green", "Light Violet",
        "Light Pink", "Light Purple", "Light Gold",
        "Dark Blue", "Dark Gray", "Dark Green", "Dark Red",
        # Samsung Phantom series
        "Phantom Black", "Phantom White", "Phantom Gray",
        "Phantom Silver", "Phantom Violet",
        # Samsung Mystic series
        "Mystic Black", "Mystic White", "Mystic Gray",
        "Mystic Bronze", "Mystic Blue", "Mystic Red",
        # Samsung Awesome series
        "Awesome Black", "Awesome Blue", "Awesome Gold",
        "Awesome White", "Awesome Green", "Awesome Gray",
        "Awesome Violet", "Awesome Mint", "Awesome Peach",
        # Other Samsung brand names
        "Menthol", "Jade", "Olive", "Aqua", "Mint", "Sage",
        "Burgundy", "Peach", "Lavender Blue",
        "Polar Silver", "Glacier Blue", "Mountain Blue",
        "Prism Black", "Prism Blue", "Prism Crush Black",
        "Ceramic Black", "Titanium Black", "Titanium Gray",
        "Bora Purple", "Lime", "Icy Blue", "Sand",
    ],
    color_cutoff=0.72,

    # noise_markers are stripped from the description after IMEI extraction.
    # OCR sometimes garbles "Adaptor" but these are stripped by regex anyway.
    noise_markers=[
        "without Adaptor", "without Charger", "without Box",
        "without Cable", "without Earphone",
        "w/o Adaptor", "w/o Charger", "w/o Earphone",
        "excl. Adaptor", "excl. Charger",
        "no Adaptor", "no Charger",
    ],

    # Samsung India invoice column headers — overrides generic synonyms.
    invoice_columns=InvoiceColumnConfig(
        description=[
            "description of goods", "description", "particulars",
            "product", "item", "goods", "details",
        ],
        # "no" intentionally omitted — it matches "SI No." column header
        quantity=[
            "quantity", "qty", "nos", "qnty", "count",
            "no of units", "no. of pcs",
        ],
        # Only map pure "Rate" column — skip "Rate (Incl. of Tax)" / MRP columns
        unit_price=["rate", "unit price", "unit rate", "mrp", "basic rate"],
        unit_price_exclude=["incl", "inclusive", "inc.", "including", "of tax"],
        amount=["amount", "value", "net amount", "amt", "total amount"],
        hsn_code=["hsn", "hsn/sac", "sac", "hsn code", "hs code"],
        serial_no=[
            "sl no", "sl. no", "sl.no", "si no", "si no.",
            "s.no", "s. no", "sno", "sr", "sr no", "sr.",
            "serial no", "item no", "no.", "seq",
        ],
    ),
)


# ══════════════════════════════════════════════════════════════════════════════
#  Schema registry  —  add new brands here
# ══════════════════════════════════════════════════════════════════════════════

DEVICE_SCHEMAS: Dict[str, DeviceSchema] = {
    "samsung": SAMSUNG_SCHEMA,
    # "apple":   APPLE_SCHEMA,    # TODO: iPhone IMEI format, color names
    # "xiaomi":  XIAOMI_SCHEMA,   # TODO: Redmi/POCO model patterns
    # "oneplus": ONEPLUS_SCHEMA,  # TODO: OnePlus model patterns
}


def detect_schema(text: str) -> Optional[DeviceSchema]:
    """
    Auto-detect which brand schema applies by scanning text for model codes.

    Tries all registered schemas and returns the first one whose model pattern
    matches.  Returns None if no schema matches (generic extraction is used).
    """
    for name, schema in DEVICE_SCHEMAS.items():
        if schema.matches(text):
            logger.debug("Schema auto-detected: %s", name)
            return schema
    return None
