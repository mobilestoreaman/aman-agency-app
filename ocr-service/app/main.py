"""
Aman Agency OCR Service — FastAPI entry-point.

Endpoints:
  GET  /health  — liveness probe (always responds, even if OCR deps failed)
  POST /extract — main OCR pipeline (returns 503 if deps unavailable)

Multi-page PDFs:
  When the input is a PDF, every page is preprocessed and OCR'd individually.
  Text blocks from all pages are merged before field extraction so that
  invoice header, line-items table, and totals footer can span multiple pages.
"""

import base64
import logging
import time
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── Defensive imports ─────────────────────────────────────────────────────────
# Heavy deps (cv2, paddleocr, etc.) are imported here so any failure is logged
# clearly.  Uvicorn still binds and /health responds even if imports fail —
# /extract will return 503 with the error detail instead.

_import_error: str = ""
_preprocessor = _engine = _field_extract = _validator = None

# Stores intermediates from the most recent /extract call — read via GET /debug/last
_last_debug: Dict[str, Any] = {}

try:
    from .models import OCRRequest, OCRResponse, InvoiceExtractionResult
    from .preprocessor import Preprocessor
    from .ocr_engine import OCREngine
    from .extractor import FieldExtractor
    from .validator import Validator

    _preprocessor  = Preprocessor()
    _engine        = OCREngine()
    _field_extract = FieldExtractor()
    _validator     = Validator()
    logger.info("OCR service: all dependencies loaded successfully")
except Exception as _exc:
    _import_error = str(_exc)
    logger.error("OCR service: dependency load failed — %s", _import_error)
    logger.error("/health will respond; /extract will return 503 until fixed")
    # Still import the Pydantic models (no heavy deps) so type hints work
    try:
        from .models import OCRRequest, OCRResponse, InvoiceExtractionResult
    except Exception:
        pass

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Aman Agency OCR Service",
    version="2.0.0",
    description="Standalone PaddleOCR-based invoice extractor with multi-page support",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    if _import_error:
        # Still return 200 (liveness) but surface the error detail
        return {"status": "degraded", "service": "ocr-service", "error": _import_error}
    return {"status": "ok", "service": "ocr-service"}


# ── Debug ─────────────────────────────────────────────────────────────────────

@app.get("/debug/last")
def debug_last():
    """
    Return intermediate results from the most recent /extract call.
    Useful for diagnosing why line_items comes back empty.
    Shows: text_block_count, table_block_count, table types, first 20 text
    blocks, row counts per table, and final line_item descriptions.
    Only available in development — do not expose in production.
    """
    if not _last_debug:
        return {"message": "No extraction has been run yet in this session"}
    return _last_debug


# ── Extract ───────────────────────────────────────────────────────────────────

@app.post("/extract")
def extract(req: "OCRRequest"):
    global _last_debug  # must be declared before any use of the variable

    if _import_error or _preprocessor is None:
        raise HTTPException(
            status_code=503,
            detail=f"OCR dependencies unavailable: {_import_error or 'unknown import error'}",
        )

    t0 = time.monotonic()

    # 1 ── Decode base64 payload ───────────────────────────────────────────────
    try:
        raw_bytes = base64.b64decode(req.file_b64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 payload: {exc}")

    if len(raw_bytes) < 100:
        raise HTTPException(status_code=400, detail="File payload is too small")

    warnings: List[str] = []
    is_pdf = "pdf" in (req.mime_type or "").lower()

    # 2 ── Preprocess ─────────────────────────────────────────────────────────
    # For PDFs: multi-page pipeline (standard).
    # For camera images: specialised table-image pipeline with higher resolution
    # target, aggressive CLAHE for cream/beige paper, and no binarization so
    # PaddleOCR's neural net can use the full colour gradient information.
    try:
        if is_pdf:
            pages = _preprocessor.process_pages(raw_bytes, req.mime_type)
        else:
            single = _preprocessor.process_table_image(raw_bytes, req.mime_type)
            pages  = [single]
    except Exception as exc:
        logger.error("Preprocessing failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=422, detail=f"Preprocessing error: {exc}")

    if not pages:
        raise HTTPException(status_code=422, detail="No pages could be decoded from file")

    for _, pre_meta in pages:
        warnings.extend(pre_meta.get("warnings", []))

    # 3 ── OCR each page and merge results ────────────────────────────────────
    all_text_blocks:  List[dict] = []
    all_table_blocks: List[dict] = []
    engine_name = "paddleocr"

    for page_idx, (img, pre_meta) in enumerate(pages):
        try:
            text_blocks, table_blocks, ocr_meta = _engine.extract(img)
        except Exception as exc:
            logger.error("OCR extraction failed on page %d: %s", page_idx, exc, exc_info=True)
            warnings.append(f"Page {page_idx + 1} OCR error: {exc}")
            _last_debug["ocr_error"] = str(exc)
            continue

        # Offset Y-coordinates for pages 2+ so blocks stay in order
        if page_idx > 0 and all_text_blocks:
            max_y = max(
                (b["bbox"][2][1] for b in all_text_blocks if b.get("bbox")),
                default=0,
            )
            offset = int(max_y) + 100  # 100 px gap between pages
            for b in text_blocks:
                if b.get("bbox"):
                    b["bbox"] = [[p[0], p[1] + offset] for p in b["bbox"]]

        all_text_blocks.extend(text_blocks)
        all_table_blocks.extend(table_blocks)

        if ocr_meta.get("table_inferred"):
            warnings.append(
                f"Page {page_idx + 1}: table structure inferred from text alignment "
                "— column mapping may be approximate"
            )
        if pre_meta.get("is_blurry"):
            warnings.append(
                f"Page {page_idx + 1}: " + pre_meta.get("warnings", ["blurry image"])[0]
            )

    if not all_text_blocks:
        warnings.append("OCR returned no text — image may be blank or too low quality")
        engine_name = "tesseract-fallback"

    # ── Capture debug snapshot before field extraction ────────────────────────
    _last_debug = {
        "text_block_count":  len(all_text_blocks),
        "table_block_count": len(all_table_blocks),
        "table_block_types": [tb.get("type", "unknown") for tb in all_table_blocks],
        # First 20 text blocks (text + bbox) for inspection
        "text_sample": [
            {"text": b.get("text", ""), "bbox": b.get("bbox")}
            for b in all_text_blocks[:20]
        ],
        # Row counts per table block
        "table_row_counts": [
            len(tb.get("rows") or tb.get("_all_rows") or [])
            for tb in all_table_blocks
        ],
    }
    logger.info(
        "Debug snapshot: %d text blocks, %d table blocks (types: %s)",
        len(all_text_blocks),
        len(all_table_blocks),
        _last_debug["table_block_types"],
    )

    # 4 ── Extract fields ──────────────────────────────────────────────────────
    try:
        result = _field_extract.extract(all_text_blocks, all_table_blocks)
    except Exception as exc:
        logger.error("Field extraction failed: %s", exc, exc_info=True)
        result = InvoiceExtractionResult()
        warnings.append(f"Field extraction error: {exc}")

    # 5 ── Validate + confidence scoring ──────────────────────────────────────
    try:
        result = _validator.validate(result)
    except Exception as exc:
        logger.warning("Validation step failed: %s", exc)
        warnings.append(f"Validation skipped: {exc}")

    elapsed_ms = int((time.monotonic() - t0) * 1000)

    # Enrich debug snapshot with final extraction results
    _last_debug.update({
        "line_item_count": len(result.line_items),
        "line_item_descriptions": [
            li.description.value for li in result.line_items
        ],
        "total_amount": result.total_amount.value,
        "vendor":       result.vendor_name.value,
        "invoice_num":  result.invoice_number.value,
        "elapsed_ms":   elapsed_ms,
        "warnings":     warnings,
    })

    logger.info(
        "Extracted: invoice=%s vendor=%s total=%s items=%d confidence=%.2f pages=%d [%dms]",
        result.invoice_number.value or "?",
        result.vendor_name.value or "?",
        result.total_amount.value or "?",
        len(result.line_items),
        result.overall_confidence,
        len(pages),
        elapsed_ms,
    )

    return OCRResponse(
        extraction=result,
        processing_time_ms=elapsed_ms,
        engine_name=engine_name,
        warnings=warnings,
    )
