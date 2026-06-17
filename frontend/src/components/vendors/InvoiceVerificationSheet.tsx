import { useState } from 'react'
import {
  CheckCircle2, AlertTriangle, Clock, XCircle, ChevronDown, ChevronRight,
  Loader2, RefreshCw, Zap, Brain, GitCompare, ScanText, Bot,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useVendorInvoice } from '@/hooks/useVendorInvoices'
import type { VendorInvoice, ExtractedField, InvoiceExtraction, OCRComparison, OCRMode } from '@/types'

interface Props {
  invoiceId: string | null
  onClose: () => void
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: VendorInvoice['status'] }) {
  const map: Record<VendorInvoice['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
    pending:      { label: 'Pending',      variant: 'secondary',    icon: Clock },
    processing:   { label: 'Processing',   variant: 'secondary',    icon: Loader2 },
    done:         { label: 'Done',         variant: 'default',      icon: CheckCircle2 },
    failed:       { label: 'Failed',       variant: 'destructive',  icon: XCircle },
    needs_review: { label: 'Needs Review', variant: 'outline',      icon: AlertTriangle },
  }
  const { label, variant, icon: Icon } = map[status] ?? { label: status, variant: 'secondary', icon: Clock }
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className={['h-3 w-3', status === 'processing' ? 'animate-spin' : ''].join(' ')} />
      {label}
    </Badge>
  )
}

// ─── Confidence indicator ─────────────────────────────────────────────────────

function ConfidencePill({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color =
    pct >= 85 ? 'text-green-700 bg-green-50 border-green-200' :
    pct >= 65 ? 'text-amber-700 bg-amber-50 border-amber-200' :
    'text-red-700 bg-red-50 border-red-200'
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium ${color}`}>
      {pct}%
    </span>
  )
}

// ─── Single extracted field row ───────────────────────────────────────────────

function FieldRow({ label, field }: { label: string; field: ExtractedField | undefined }) {
  if (!field || field.value === '') return null
  return (
    <div className="grid grid-cols-[140px_1fr_auto] gap-2 items-start py-1.5">
      <span className="text-xs text-muted-foreground pt-0.5">{label}</span>
      <span className={['text-sm break-words', field.needs_review ? 'text-amber-700' : ''].join(' ')}>
        {field.value}
        {field.needs_review && <AlertTriangle className="inline ml-1 h-3 w-3 text-amber-500" />}
      </span>
      <ConfidencePill value={field.confidence} />
    </div>
  )
}

// ─── Engine mode icon ─────────────────────────────────────────────────────────

const ENGINE_ICONS: Record<OCRMode | string, React.ElementType> = {
  auto:      Zap,
  primary:   Zap,
  alternate: Brain,
  both:      GitCompare,
  paddleocr: ScanText,
  tesseract: Bot,
  merged:    GitCompare,
}

function EngineIcon({ mode }: { mode: string }) {
  const Icon = ENGINE_ICONS[mode] ?? Zap
  return <Icon className="h-3.5 w-3.5" />
}

// ─── OCR Comparison panel ─────────────────────────────────────────────────────

function OCRComparisonPanel({ comparison }: { comparison: OCRComparison }) {
  const [expanded, setExpanded] = useState(false)
  const conflictCount = comparison.conflicts?.length ?? 0

  return (
    <div className="rounded-lg border bg-muted/30 overflow-hidden">
      <button
        className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitCompare className="h-4 w-4 text-muted-foreground" />
          Engine Comparison
        </div>
        <div className="flex items-center gap-2">
          {conflictCount > 0 && (
            <Badge variant="outline" className="text-xs py-0">
              {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
            </Badge>
          )}
          <Badge variant={comparison.auto_merged ? 'secondary' : 'default'} className="text-xs py-0">
            {comparison.auto_merged ? 'Field-merged' : 'Best engine'}
          </Badge>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t p-3 space-y-4">
          {/* Per-engine stats */}
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                name: comparison.primary_engine,
                conf: comparison.primary_confidence,
                ms: comparison.primary_time_ms,
              },
              {
                name: comparison.alternate_engine,
                conf: comparison.alt_confidence,
                ms: comparison.alt_time_ms,
              },
            ].map((eng) => (
              <div key={eng.name} className="rounded-md border bg-background p-2.5 space-y-1">
                <p className="text-xs font-medium truncate">{eng.name}</p>
                <div className="flex items-center gap-2">
                  <ConfidencePill value={eng.conf} />
                  <span className="text-[10px] text-muted-foreground">
                    {(eng.ms / 1000).toFixed(1)}s
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Conflict table */}
          {conflictCount > 0 && (
            <div>
              <p className="text-xs font-medium mb-2 text-muted-foreground">Field Conflicts</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs py-1.5">Field</TableHead>
                    <TableHead className="text-xs py-1.5">Primary</TableHead>
                    <TableHead className="text-xs py-1.5">Alternate</TableHead>
                    <TableHead className="text-xs py-1.5">Chosen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparison.conflicts?.map((c) => (
                    <TableRow key={c.field}>
                      <TableCell className="text-xs font-mono py-1.5">{c.field}</TableCell>
                      <TableCell className="text-xs py-1.5">
                        <span className={c.selected_value === c.primary_value ? 'font-medium text-green-700' : 'text-muted-foreground'}>
                          {c.primary_value}
                        </span>
                        <ConfidencePill value={c.primary_conf} />
                      </TableCell>
                      <TableCell className="text-xs py-1.5">
                        <span className={c.selected_value === c.alt_value ? 'font-medium text-green-700' : 'text-muted-foreground'}>
                          {c.alt_value}
                        </span>
                        <ConfidencePill value={c.alt_conf} />
                      </TableCell>
                      <TableCell className="text-xs py-1.5">
                        <span className="font-medium">{c.selected_value}</span>
                        <p className="text-[9px] text-muted-foreground">{c.selected_by}</p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main sheet ───────────────────────────────────────────────────────────────

export default function InvoiceVerificationSheet({ invoiceId, onClose }: Props) {
  const { data: invoice, isLoading, refetch } = useVendorInvoice(invoiceId ?? undefined)
  const isPolling = invoice?.status === 'pending' || invoice?.status === 'processing'

  const ext: InvoiceExtraction | undefined = invoice?.extraction
  const m = invoice?.ocr_metrics

  return (
    <Sheet open={!!invoiceId} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent className="w-full max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="truncate">
                {invoice?.original_name ?? 'Invoice'}
              </SheetTitle>
              {invoice && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Uploaded by {invoice.uploaded_by} ·{' '}
                  {new Date(invoice.created_at).toLocaleDateString('en-IN')}
                </p>
              )}
            </div>
            {invoice && <StatusBadge status={invoice.status} />}
          </div>

          {/* OCR metrics strip */}
          {m && (
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="outline" className="gap-1 text-xs py-0">
                <EngineIcon mode={m.mode} />
                {m.engine_used}
              </Badge>
              <Badge variant="outline" className="text-xs py-0">
                {(m.processing_ms / 1000).toFixed(1)}s
              </Badge>
              {m.retry_count > 0 && (
                <Badge variant="outline" className="text-xs py-0 text-amber-600">
                  Retried ×{m.retry_count}
                </Badge>
              )}
              {ext && (
                <Badge
                  variant="outline"
                  className={['text-xs py-0', ext.overall_confidence >= 0.85 ? 'text-green-700' : ext.overall_confidence >= 0.65 ? 'text-amber-700' : 'text-red-700'].join(' ')}
                >
                  {Math.round(ext.overall_confidence * 100)}% overall
                </Badge>
              )}
              {ext && ext.low_confidence_count > 0 && (
                <Badge variant="outline" className="text-xs py-0 text-amber-600">
                  {ext.low_confidence_count} low-confidence field{ext.low_confidence_count !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          )}
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-5">

            {/* Loading state */}
            {isLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Processing state */}
            {(invoice?.status === 'pending' || invoice?.status === 'processing') && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div>
                  <p className="font-medium">Scanning invoice…</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    This usually takes 5–30 seconds depending on the engine.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Refresh
                </Button>
              </div>
            )}

            {/* Failed state */}
            {invoice?.status === 'failed' && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="flex items-start gap-2 text-red-700">
                  <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">OCR extraction failed</p>
                    {invoice.processing_error && (
                      <p className="text-xs mt-1 text-red-600">{invoice.processing_error}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Extraction results */}
            {ext && (
              <>
                {/* Vendor info */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Vendor Details
                  </h3>
                  <FieldRow label="Name"    field={ext.vendor_name} />
                  <FieldRow label="GSTIN"   field={ext.vendor_gstin} />
                  <FieldRow label="Phone"   field={ext.vendor_phone} />
                  <FieldRow label="Email"   field={ext.vendor_email} />
                  <FieldRow label="Address" field={ext.vendor_address} />
                </div>

                <Separator />

                {/* Invoice details */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Invoice Details
                  </h3>
                  <FieldRow label="Invoice No."    field={ext.invoice_number} />
                  <FieldRow label="Invoice Date"   field={ext.invoice_date} />
                  <FieldRow label="Due Date"       field={ext.due_date} />
                  <FieldRow label="Payment Terms"  field={ext.payment_terms} />
                </div>

                <Separator />

                {/* Financials */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Financial Summary
                  </h3>
                  <FieldRow label="Subtotal"     field={ext.subtotal} />
                  <FieldRow label="CGST"         field={ext.cgst} />
                  <FieldRow label="SGST"         field={ext.sgst} />
                  <FieldRow label="IGST"         field={ext.igst} />
                  <FieldRow label="Total Tax"    field={ext.tax_amount} />
                  <FieldRow label="Total Amount" field={ext.total_amount} />
                </div>

                {/* Line items */}
                {ext.line_items && ext.line_items.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                        Line Items ({ext.line_items.length})
                      </h3>
                      <div className="rounded-md border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Description</TableHead>
                              <TableHead className="text-xs text-right">Qty</TableHead>
                              <TableHead className="text-xs text-right">Rate</TableHead>
                              <TableHead className="text-xs text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ext.line_items.map((li, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs">
                                  {li.description.value}
                                  {li.hsn_code.value && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      HSN: {li.hsn_code.value}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-right">{li.quantity.value}</TableCell>
                                <TableCell className="text-xs text-right">{li.unit_price.value}</TableCell>
                                <TableCell className="text-xs text-right">{li.amount.value}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </>
                )}

                {ext.notes.value && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                        Notes
                      </h3>
                      <p className="text-sm text-muted-foreground">{ext.notes.value}</p>
                    </div>
                  </>
                )}

                {/* Comparison panel */}
                {invoice?.ocr_comparison && (
                  <>
                    <Separator />
                    <OCRComparisonPanel comparison={invoice.ocr_comparison} />
                  </>
                )}
              </>
            )}

            {/* Auto-refresh hint for processing state */}
            {isPolling && (
              <p className="text-xs text-center text-muted-foreground pb-2">
                Results will appear automatically when scanning completes.
              </p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
