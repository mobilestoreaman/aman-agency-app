/**
 * BarcodeScanner
 * --------------
 * Full-screen camera dialog for scanning barcodes / QR codes / IMEIs.
 *
 * Detection strategy:
 *   1. BarcodeDetector API  — Chrome 83+, Edge, Samsung Internet (all platforms)
 *   2. No-library fallback  — live camera feed + manual input side-by-side
 *      (Firefox, Safari: user can see the code clearly on screen and type it)
 *
 * Features:
 *   • Opens as a full-screen Dialog overlay (Dialog from shadcn/ui)
 *   • Camera starts automatically when dialog opens
 *   • Camera flip button (front ↔ rear) for phones/tablets
 *   • Animated scan-line sweeping the viewfinder
 *   • Green highlight box drawn over detected barcodes
 *   • 2-second debounce so the same code is not emitted twice
 *   • Manual text input always visible as a fallback below the viewfinder
 *
 * Usage:
 *   <BarcodeScannerButton onScan={(code) => setValue('barcode', code)} />
 *
 *   — or inline, without the trigger button:
 *   <BarcodeScanner open={open} onClose={…} onDetect={(code) => …} />
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Camera, CameraOff, FlipHorizontal2, Loader2, ScanLine, Keyboard,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// ── BarcodeDetector type shim ────────────────────────────────────────────────
interface BarcodeDetectorResult {
  rawValue: string
  format: string
  boundingBox: DOMRectReadOnly
  cornerPoints: Array<{ x: number; y: number }>
}
declare class BarcodeDetector {
  static getSupportedFormats(): Promise<string[]>
  constructor(options?: { formats?: string[] })
  detect(image: ImageBitmapSource): Promise<BarcodeDetectorResult[]>
}

// ── Constants ────────────────────────────────────────────────────────────────
const DEBOUNCE_MS      = 2_000
const SCAN_INTERVAL_MS = 200
const TARGET_FORMATS   = [
  'code_128', 'code_39', 'code_93', 'ean_13', 'ean_8',
  'qr_code', 'upc_a', 'upc_e', 'data_matrix', 'itf',
]

// ── Core scanner component ───────────────────────────────────────────────────
interface BarcodeScannerProps {
  open: boolean
  onClose: () => void
  onDetect: (code: string) => void
  /** Text shown above the viewfinder */
  hint?: string
}

export function BarcodeScanner({ open, onClose, onDetect, hint }: BarcodeScannerProps) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastCodeRef = useRef<{ code: string; ts: number } | null>(null)
  const detectorRef = useRef<InstanceType<typeof BarcodeDetector> | null>(null)

  const [starting,     setStarting]     = useState(false)
  const [cameraError,  setCameraError]  = useState<string | null>(null)
  const [facing,       setFacing]       = useState<'environment' | 'user'>('environment')
  const [hasMultiple,  setHasMultiple]  = useState(false)   // true → show flip button
  const [supported,    setSupported]    = useState(false)   // BarcodeDetector available
  const [manualValue,  setManualValue]  = useState('')
  const [lastDetected, setLastDetected] = useState<string | null>(null)

  // ── BarcodeDetector availability ─────────────────────────────────────────
  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window)
  }, [])

  // ── Check if device has multiple cameras ─────────────────────────────────
  useEffect(() => {
    if (!open) return
    navigator.mediaDevices?.enumerateDevices().then((devices) => {
      const videoCams = devices.filter((d) => d.kind === 'videoinput')
      setHasMultiple(videoCams.length > 1)
    }).catch(() => { /* ignore */ })
  }, [open])

  // ── Draw green box over detected barcodes ────────────────────────────────
  const drawOverlay = useCallback((results: BarcodeDetectorResult[]) => {
    const canvas = canvasRef.current
    const video  = videoRef.current
    if (!canvas || !video) return

    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const r of results) {
      const pts = r.cornerPoints
      if (pts.length < 4) continue
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.closePath()
      ctx.strokeStyle = 'rgba(34,197,94,0.9)'
      ctx.lineWidth   = 3
      ctx.stroke()
      ctx.fillStyle   = 'rgba(34,197,94,0.15)'
      ctx.fill()
    }
  }, [])

  // ── Start camera ─────────────────────────────────────────────────────────
  const startCamera = useCallback(async (facingMode: 'environment' | 'user') => {
    setStarting(true)
    setCameraError(null)
    stopStream()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Only set up BarcodeDetector scanning loop if supported
      if (supported && 'BarcodeDetector' in window) {
        if (!detectorRef.current) {
          detectorRef.current = new BarcodeDetector({ formats: TARGET_FORMATS })
        }
        const detector = detectorRef.current

        timerRef.current = setInterval(async () => {
          const video = videoRef.current
          if (!video || video.readyState < 2) return
          try {
            const results = await detector.detect(video)
            drawOverlay(results)
            if (results.length > 0) {
              const code = results[0].rawValue.trim()
              if (!code) return
              const now  = Date.now()
              const last = lastCodeRef.current
              if (!last || last.code !== code || now - last.ts > DEBOUNCE_MS) {
                lastCodeRef.current = { code, ts: now }
                setLastDetected(code)
                onDetect(code)
              }
            }
          } catch {
            // ignore transient frame errors
          }
        }, SCAN_INTERVAL_MS)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')) {
        setCameraError('Camera permission denied. Please allow camera access in your browser settings and try again.')
      } else if (msg.toLowerCase().includes('notfound') || msg.toLowerCase().includes('devicenotfound')) {
        setCameraError('No camera found on this device.')
      } else {
        setCameraError(`Could not start camera: ${msg}`)
      }
    } finally {
      setStarting(false)
    }
  }, [drawOverlay, onDetect, supported])

  function stopStream() {
    if (timerRef.current)  { clearInterval(timerRef.current);  timerRef.current  = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null }
    const canvas = canvasRef.current
    if (canvas) { const ctx = canvas.getContext('2d'); ctx?.clearRect(0, 0, canvas.width, canvas.height) }
  }

  // ── Lifecycle — start when dialog opens, stop when it closes ─────────────
  useEffect(() => {
    if (open) {
      setLastDetected(null)
      setManualValue('')
      startCamera(facing)
    } else {
      stopStream()
    }
    return stopStream
  }, [open, facing, startCamera])

  // ── Flip camera ───────────────────────────────────────────────────────────
  const flipCamera = () => {
    const next = facing === 'environment' ? 'user' : 'environment'
    setFacing(next)
    startCamera(next)
  }

  // ── Manual submit ─────────────────────────────────────────────────────────
  const handleManual = (e: React.FormEvent) => {
    e.preventDefault()
    const v = manualValue.trim()
    if (!v) return
    onDetect(v)
    setManualValue('')
    setLastDetected(v)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent
        className="flex max-h-[95dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        // Remove default close button padding so our custom header fits flush
        style={{ borderRadius: '1rem' }}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <DialogHeader className="shrink-0 px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-4 w-4 text-primary" />
            {hint ?? 'Scan barcode / IMEI'}
          </DialogTitle>
        </DialogHeader>

        {/* ── Camera viewfinder ───────────────────────────────────────── */}
        <div className="relative mx-4 overflow-hidden rounded-xl bg-black" style={{ aspectRatio: '4/3' }}>

          {/* Loading spinner */}
          {starting && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 text-white">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-white/70">Starting camera…</p>
            </div>
          )}

          {/* Error state */}
          {cameraError && !starting && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-5 text-center">
              <CameraOff className="h-10 w-10 text-destructive" />
              <p className="text-sm text-white/80">{cameraError}</p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => startCamera(facing)}
              >
                <Camera className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          )}

          {/* Live video */}
          <video
            ref={videoRef}
            muted
            playsInline
            className="h-full w-full object-cover"
            style={{ display: cameraError || starting ? 'none' : 'block' }}
          />

          {/* BarcodeDetector overlay canvas */}
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />

          {/* Viewfinder corners + animated scan line */}
          {!cameraError && !starting && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {/* Dark vignette */}
              <div className="absolute inset-0 shadow-[inset_0_0_60px_rgba(0,0,0,0.5)]" />

              {/* Target box */}
              <div className="relative h-44 w-72">
                {/* Corner brackets */}
                {(['tl','tr','bl','br'] as const).map((pos) => (
                  <span
                    key={pos}
                    className={cn(
                      'absolute h-7 w-7 border-primary',
                      pos === 'tl' && 'left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-sm',
                      pos === 'tr' && 'right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-sm',
                      pos === 'bl' && 'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-sm',
                      pos === 'br' && 'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-sm',
                    )}
                  />
                ))}
                {/* Scan line animation */}
                {supported && (
                  <div
                    className="absolute left-1 right-1 h-0.5 rounded-full bg-primary opacity-90 shadow-[0_0_8px_2px] shadow-primary"
                    style={{ animation: 'scanline 2s ease-in-out infinite' }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Camera flip button (top-right corner) */}
          {hasMultiple && !cameraError && !starting && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute right-2 top-2 z-10 h-9 w-9 rounded-full bg-black/40 text-white hover:bg-black/60"
              onClick={flipCamera}
              title="Flip camera"
            >
              <FlipHorizontal2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* ── Info / last detected ────────────────────────────────────── */}
        <div className="px-4 py-2 text-center">
          {lastDetected ? (
            <p className="text-sm font-mono font-semibold text-emerald-600">
              ✓ {lastDetected}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {supported
                ? 'Position the barcode or IMEI inside the frame'
                : 'Camera preview active — type the code you see below'}
            </p>
          )}
        </div>

        {/* ── Manual input (always shown) ─────────────────────────────── */}
        <form onSubmit={handleManual} className="flex gap-2 px-4 pb-5">
          <div className="relative flex-1">
            <Keyboard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder="Or type code manually…"
              className="pl-9 font-mono text-sm"
              inputMode="numeric"
            />
          </div>
          <Button type="submit" disabled={!manualValue.trim()} size="default">
            Add
          </Button>
        </form>
      </DialogContent>

      {/* ── Scan-line CSS animation ─────────────────────────────────────── */}
      <style>{`
        @keyframes scanline {
          0%   { top: 4px;   opacity: 1; }
          50%  { top: calc(100% - 4px); opacity: 1; }
          100% { top: 4px;   opacity: 1; }
        }
      `}</style>
    </Dialog>
  )
}

// ── Convenience trigger button ───────────────────────────────────────────────
/**
 * Drop-in trigger button that opens the BarcodeScanner dialog.
 *
 * Usage:
 *   <BarcodeScannerButton
 *     hint="Scan product barcode"
 *     onScan={(code) => setValue('barcode', code)}
 *   />
 */
interface BarcodeScannerButtonProps {
  onScan: (code: string) => void
  hint?: string
  /** Close dialog automatically after first scan (default: true) */
  closeOnScan?: boolean
  className?: string
  label?: string
}

export function BarcodeScannerButton({
  onScan,
  hint,
  closeOnScan = true,
  className,
  label = 'Scan',
}: BarcodeScannerButtonProps) {
  const [open, setOpen] = useState(false)

  const handleDetect = (code: string) => {
    onScan(code)
    if (closeOnScan) setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn('gap-1.5', className)}
        onClick={() => setOpen(true)}
      >
        <Camera className="h-3.5 w-3.5" />
        {label}
      </Button>
      <BarcodeScanner
        open={open}
        onClose={() => setOpen(false)}
        onDetect={handleDetect}
        hint={hint}
      />
    </>
  )
}

export default BarcodeScanner
