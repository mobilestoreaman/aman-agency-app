"""
Pydantic schemas for the OCR service.
Field names and structure intentionally mirror the Go models.InvoiceExtractionResult
so the RemoteEngine can deserialise the JSON response directly.
"""
from pydantic import BaseModel, Field
from typing import List


class ExtractedField(BaseModel):
    value: str = ""
    confidence: float = 0.0
    needs_review: bool = False


class ExtractedLineItem(BaseModel):
    description: ExtractedField = Field(default_factory=ExtractedField)
    quantity:    ExtractedField = Field(default_factory=ExtractedField)
    unit_price:  ExtractedField = Field(default_factory=ExtractedField)
    amount:      ExtractedField = Field(default_factory=ExtractedField)
    hsn_code:    ExtractedField = Field(default_factory=ExtractedField)
    tax_rate:    ExtractedField = Field(default_factory=ExtractedField)
    # Device-specific fields (populated for smartphone/electronics invoices)
    imei:        ExtractedField = Field(default_factory=ExtractedField)
    model_code:  ExtractedField = Field(default_factory=ExtractedField)
    color:       ExtractedField = Field(default_factory=ExtractedField)
    storage:     ExtractedField = Field(default_factory=ExtractedField)


class InvoiceExtractionResult(BaseModel):
    # ── Vendor / supplier ──────────────────────────────────────────────────
    vendor_name:    ExtractedField = Field(default_factory=ExtractedField)
    vendor_gstin:   ExtractedField = Field(default_factory=ExtractedField)
    vendor_phone:   ExtractedField = Field(default_factory=ExtractedField)
    vendor_address: ExtractedField = Field(default_factory=ExtractedField)
    vendor_email:   ExtractedField = Field(default_factory=ExtractedField)

    # ── Invoice metadata ───────────────────────────────────────────────────
    invoice_number: ExtractedField = Field(default_factory=ExtractedField)
    invoice_date:   ExtractedField = Field(default_factory=ExtractedField)
    due_date:       ExtractedField = Field(default_factory=ExtractedField)
    payment_terms:  ExtractedField = Field(default_factory=ExtractedField)

    # ── Indian GST totals ──────────────────────────────────────────────────
    subtotal:     ExtractedField = Field(default_factory=ExtractedField)
    cgst:         ExtractedField = Field(default_factory=ExtractedField)
    sgst:         ExtractedField = Field(default_factory=ExtractedField)
    igst:         ExtractedField = Field(default_factory=ExtractedField)
    tax_amount:   ExtractedField = Field(default_factory=ExtractedField)
    total_amount: ExtractedField = Field(default_factory=ExtractedField)
    notes:        ExtractedField = Field(default_factory=ExtractedField)

    # ── Line items ─────────────────────────────────────────────────────────
    line_items: List[ExtractedLineItem] = Field(default_factory=list)

    # ── Quality ────────────────────────────────────────────────────────────
    overall_confidence:  float = 0.0
    low_confidence_count: int  = 0


class OCRRequest(BaseModel):
    file_b64:  str  # base64-encoded file bytes
    mime_type: str  # e.g. "image/jpeg", "application/pdf"


class OCRResponse(BaseModel):
    extraction:        InvoiceExtractionResult
    processing_time_ms: int
    engine_name:       str
    warnings:          List[str] = Field(default_factory=list)
