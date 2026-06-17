import { useCallback, useRef, useState } from 'react'
import { Upload, FileText, X, Zap, ScanText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useUploadVendorInvoice, OCR_MODE_OPTIONS } from '@/hooks/useVendorInvoices'
import type { OCRMode, VendorInvoice } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  /** Called when the upload succeeds and returns the created invoice record. */
  onUploaded?: (invoice: VendorInvoice) => void
}

const ACCEPTED = '.pdf,.jpg,.jpeg,.png'
const MAX_MB = 20

// Standalone OCR — Tesseract runs entirely in-house, no subscription needed.
const MODE_ICONS: Record<OCRMode, React.ElementType> = {
  auto:      Zap,
  tesseract: ScanText,
}

export default function InvoiceUploadModal({ open, onClose, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<OCRMode>('auto')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = useUploadVendorInvoice(mode)

  const handleFile = (f: File) => {
    if (f.size > MAX_MB * 1024 * 1024) {
      alert(`File exceeds ${MAX_MB} MB limit`)
      return
    }
    setFile(f)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [])

  const handleSubmit = () => {
    if (!file) return
    upload.mutate(file, {
      onSuccess: (invoice) => {
        setFile(null)
        onClose()
        onUploaded?.(invoice)
      },
    })
  }

  const reset = () => {
    setFile(null)
    upload.reset()
  }

  const selectedOption = OCR_MODE_OPTIONS.find((o) => o.value === mode)
  const ModeIcon = MODE_ICONS[mode] ?? Zap

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Vendor Invoice</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* OCR Engine selector */}
          <div className="space-y-1.5">
            <Label htmlFor="ocr-mode">OCR Engine</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as OCRMode)}>
              <SelectTrigger id="ocr-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OCR_MODE_OPTIONS.map((opt) => {
                  const Icon = MODE_ICONS[opt.value]
                  return (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{opt.label}</span>
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            {selectedOption && (
              <p className="text-xs text-muted-foreground">{selectedOption.description}</p>
            )}
          </div>

          {/* Drop zone */}
          {!file ? (
            <div
              className={[
                'flex flex-col items-center justify-center rounded-lg border-2 border-dashed',
                'py-10 px-4 cursor-pointer transition-colors',
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40',
              ].join(' ')}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Drop invoice here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, JPEG, or PNG · max {MAX_MB} MB</p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                  e.target.value = ''
                }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
              <FileText className="h-8 w-8 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB · {file.type || 'unknown type'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={reset}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Mode badge shown when a file is selected */}
          {file && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ModeIcon className="h-3.5 w-3.5" />
              <span>Will scan using</span>
              <Badge variant="secondary" className="text-xs py-0">
                {selectedOption?.label ?? mode}
              </Badge>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { reset(); onClose() }} disabled={upload.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!file || upload.isPending}
          >
            {upload.isPending ? 'Scanning…' : 'Upload & Scan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
