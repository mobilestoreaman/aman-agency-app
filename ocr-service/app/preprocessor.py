"""
OpenCV preprocessing pipeline for Indian retail invoices.

Two modes:
  process()        — original 10-stage pipeline (PDFs, clean scans)
  process_table_image() — specialized 8-stage pipeline for camera-captured
                          device-table photos (Samsung, Xiaomi, etc.)

Stage order is critical — each stage relies on the previous one.

Standard pipeline (process / process_pages):
  1  Blur detection      — metadata only; feeds quality warnings + binarize tuning
  2  EXIF rotation       — fix phone-camera orientation before any transform
  3  Deskew              — correct tilt (up to ±15°) using minAreaRect
  4  Perspective correct — 4-point transform for camera-shot documents
  5  Shadow removal      — morphological background subtraction
  6  Bilateral filter    — edge-preserving denoise (replaces NLM — faster, better for table grids)
  7  CLAHE               — contrast enhancement on L channel (LAB space, clipLimit=3.5)
  8  Resolution          — upscale to ≥ 1 800 px height
  9  Adaptive binarize   — hybrid Otsu/Gaussian adaptive (params tuned to blur score)
  10 Morphological fix   — closing to reconnect broken character strokes

Table-image pipeline (process_table_image):
  Same as above but:
  • Target height ≥ 2 400 px (small model-code text needs higher resolution)
  • CLAHE clipLimit = 5.0 (cream/beige paper needs aggressive contrast boost)
  • Binarization skipped — PaddleOCR's own neural net handles thresholding better
    on colour-enhanced images, and preserves faint table grid lines
  • Post-sharpen with stronger unsharp mask

Multi-page PDFs:
  Use process_pages() instead of process() to get one preprocessed image per page.
  The caller merges OCR results across pages.
"""

import io
import logging
from typing import List, Tuple

import cv2
import numpy as np
from PIL import Image, ExifTags

logger = logging.getLogger(__name__)


class Preprocessor:
    MIN_HEIGHT       = 1_800   # standard pipeline minimum height (px)
    TABLE_MIN_HEIGHT = 2_400   # table-image pipeline minimum height (px)
    PDF_DPI_RATIO    = 300 / 72  # rasterise PDF at 300 DPI
    MAX_PAGES        = 10        # cap on pages to process per PDF

    # ── Public API ────────────────────────────────────────────────────────────

    def process(self, image_bytes: bytes, mime_type: str) -> Tuple[np.ndarray, dict]:
        """
        Run the full pipeline on the first page / image.
        Returns (preprocessed_bgr_image, quality_metadata_dict).
        """
        pages = self.process_pages(image_bytes, mime_type)
        if not pages:
            raise ValueError("Could not decode any image/page from the input file")
        return pages[0]

    def process_pages(
        self, image_bytes: bytes, mime_type: str
    ) -> List[Tuple[np.ndarray, dict]]:
        """
        Run the full pipeline on every page of a PDF, or just the single image.
        Returns a list of (preprocessed_bgr_image, quality_metadata_dict), one
        element per page.  Callers can iterate and merge OCR results.
        """
        if "pdf" in mime_type:
            raw_pages = self._pdf_to_images(image_bytes)
        else:
            raw_pages = [("image", image_bytes)]

        results: List[Tuple[np.ndarray, dict]] = []
        for page_idx, (_, data) in enumerate(raw_pages[: self.MAX_PAGES]):
            try:
                img, meta = self._run_pipeline(data, mime_type, page_idx=page_idx)
                results.append((img, meta))
            except Exception as exc:
                logger.warning("Page %d preprocessing failed: %s", page_idx, exc)
        return results

    def process_table_image(
        self, image_bytes: bytes, mime_type: str
    ) -> Tuple[np.ndarray, dict]:
        """
        Specialized pipeline for camera-captured device-table images.
        Optimised for Samsung/Xiaomi-style invoices: cream paper, light grid
        lines, small model-code text photographed with a phone camera.

        Key differences from the standard pipeline:
          • Higher upscale target (2 400 px) for small device-code text
          • Higher CLAHE clipLimit (5.0) for cream/beige paper
          • No binarization — PaddleOCR's neural net works better on colour-
            enhanced images; binarization can erase faint table grid lines
          • Stronger sharpening to crisp up model-code characters
        """
        pages = self._pdf_to_images(image_bytes) if "pdf" in mime_type else [("image", image_bytes)]
        if not pages:
            raise ValueError("Could not decode image")
        _, data = pages[0]
        return self._run_table_pipeline(data, mime_type)

    # ── Standard pipeline ─────────────────────────────────────────────────────

    def _run_pipeline(
        self, image_data: bytes, mime_type: str, page_idx: int = 0
    ) -> Tuple[np.ndarray, dict]:
        warnings: List[str] = []
        meta: dict = {"warnings": warnings, "page": page_idx}

        img = self._decode(image_data, mime_type)
        meta["original_shape"] = list(img.shape)

        # 1 ── Blur score (metadata; no transform) ────────────────────────────
        blur = self._laplacian_variance(img)
        meta["blur_score"] = round(blur, 1)
        if blur < 100:
            meta["is_blurry"] = True
            warnings.append(
                f"Low image quality — blur score {blur:.0f} "
                f"(recommended ≥ 100); OCR accuracy may be reduced"
            )

        # 2 ── EXIF orientation ────────────────────────────────────────────────
        img = self._fix_exif(image_data, img, mime_type)

        # 3 ── Deskew ─────────────────────────────────────────────────────────
        img, angle = self._deskew(img)
        if abs(angle) > 0.5:
            meta["deskew_angle_deg"] = round(angle, 2)

        # 4 ── Perspective correction ─────────────────────────────────────────
        corrected, img = self._perspective_correct(img)
        meta["perspective_corrected"] = corrected

        # 5 ── Shadow / uneven illumination removal ───────────────────────────
        img = self._remove_shadow(img)

        # 6 ── Bilateral filter (edge-preserving denoise) ─────────────────────
        img = self._bilateral_filter(img)

        # 7 ── CLAHE contrast enhancement ─────────────────────────────────────
        img = self._clahe(img, clip_limit=3.5, tile=(6, 6))

        # 8 ── Ensure minimum resolution ──────────────────────────────────────
        img, upscaled = self._ensure_resolution(img, min_height=self.MIN_HEIGHT)
        meta["upscaled"] = upscaled

        # 9 ── Adaptive binarization (tuned to blur score) ────────────────────
        img = self._adaptive_binarize(img, blur_score=blur)

        # 10 ─ Morphological fix (reconnect broken character strokes) ─────────
        img = self._morphological_fix(img)

        return img, meta

    # ── Table-image pipeline ──────────────────────────────────────────────────

    def _run_table_pipeline(
        self, image_data: bytes, mime_type: str
    ) -> Tuple[np.ndarray, dict]:
        """
        Pipeline for camera-captured device-table photos (Samsung, Xiaomi, etc.).

        Design principle: keep processing conservative.  PaddleOCR's own neural
        net handles a lot of noise/lighting variation — over-processing can hurt
        more than it helps.  The critical steps are:
          • Correct orientation (EXIF + deskew)
          • Normalize background/shadows
          • Moderate contrast boost (CLAHE 3.0)
          • Upscale to at least 1 800 px (fine model codes need resolution)
          • Binarize only for sharp images (helps PaddleOCR on printed text);
            leave blurry images in greyscale so neural net can use gradient info
        """
        warnings: List[str] = []
        meta: dict = {"warnings": warnings, "mode": "table_image"}

        img = self._decode(image_data, mime_type)
        meta["original_shape"] = list(img.shape)

        # 1 ── Blur score ──────────────────────────────────────────────────────
        blur = self._laplacian_variance(img)
        meta["blur_score"] = round(blur, 1)
        if blur < 80:
            meta["is_blurry"] = True
            warnings.append(
                f"Image is blurry (score {blur:.0f}); try retaking with better lighting"
            )

        # 2 ── EXIF rotation ───────────────────────────────────────────────────
        img = self._fix_exif(image_data, img, mime_type)

        # 3 ── Deskew ─────────────────────────────────────────────────────────
        img, angle = self._deskew(img)
        if abs(angle) > 0.5:
            meta["deskew_angle_deg"] = round(angle, 2)

        # 4 ── Perspective correction ──────────────────────────────────────────
        corrected, img = self._perspective_correct(img)
        meta["perspective_corrected"] = corrected

        # 5 ── Shadow / background normalisation ─────────────────────────────
        img = self._remove_shadow(img)

        # 6 ── Mild bilateral filter — edge-preserving, not too aggressive ────
        #  d=7 is lighter than the 9/11 used elsewhere; keeps fine character
        #  strokes intact while smoothing camera noise.
        img = self._bilateral_filter(img, d=7, sigma_color=50, sigma_space=50)

        # 7 ── CLAHE — moderate boost for cream/beige paper ───────────────────
        img = self._clahe(img, clip_limit=3.0, tile=(6, 6))

        # 8 ── Ensure minimum 1 800 px height ─────────────────────────────────
        img, upscaled = self._ensure_resolution(img, min_height=self.MIN_HEIGHT)
        meta["upscaled"] = upscaled

        # 9 ── Conditional binarization ───────────────────────────────────────
        #  Sharp images: binarize to give PaddleOCR maximum text/background
        #  contrast on printed characters.
        #  Blurry images: skip binarization — PaddleOCR's neural net can extract
        #  gradient information from greyscale that a binary image destroys.
        if blur >= 80:
            img = self._adaptive_binarize(img, blur_score=blur)
            img = self._morphological_fix(img)
        else:
            # Just sharpen without binarizing
            img = self._sharpen(img)

        return img, meta

    # ── Decode ────────────────────────────────────────────────────────────────

    def _decode(self, data: bytes, mime: str) -> np.ndarray:
        arr = np.frombuffer(data, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is not None:
            return img
        if "pdf" in mime:
            pages = self._pdf_to_images(data)
            if pages:
                arr2 = np.frombuffer(pages[0][1], dtype=np.uint8)
                img2 = cv2.imdecode(arr2, cv2.IMREAD_COLOR)
                if img2 is not None:
                    return img2
        raise ValueError("Could not decode image — unsupported format or corrupt file")

    def _pdf_to_images(self, data: bytes) -> List[Tuple[str, bytes]]:
        """
        Rasterise ALL pages of a PDF at 300 DPI.
        Returns list of (page_tag, jpeg_bytes).
        Tries PyMuPDF first, falls back to poppler.
        """
        try:
            import fitz  # PyMuPDF
            doc   = fitz.open(stream=data, filetype="pdf")
            pages = []
            for page_num in range(min(doc.page_count, self.MAX_PAGES)):
                page = doc[page_num]
                mat  = fitz.Matrix(self.PDF_DPI_RATIO, self.PDF_DPI_RATIO)
                pix  = page.get_pixmap(matrix=mat)
                arr  = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
                    pix.height, pix.width, pix.n
                )
                bgr  = cv2.cvtColor(
                    arr,
                    cv2.COLOR_RGBA2BGR if pix.n == 4 else cv2.COLOR_RGB2BGR,
                )
                _, jpeg = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])
                pages.append((f"page_{page_num}", jpeg.tobytes()))
            return pages
        except ImportError:
            pass

        import os, subprocess, tempfile, glob as _glob
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(data)
            pdf_path = f.name
        base = pdf_path[:-4]
        pages = []
        try:
            subprocess.run(
                ["pdftoppm", "-r", "300", "-jpeg",
                 "-f", "1", "-l", str(self.MAX_PAGES),
                 pdf_path, base],
                check=True, capture_output=True,
            )
            for path in sorted(_glob.glob(f"{base}-*.jpg")):
                with open(path, "rb") as fh:
                    pages.append((os.path.basename(path), fh.read()))
                os.unlink(path)
        finally:
            if os.path.exists(pdf_path):
                os.unlink(pdf_path)
        return pages or [(base, data)]

    # ── Stages ───────────────────────────────────────────────────────────────

    def _laplacian_variance(self, img: np.ndarray) -> float:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        return float(cv2.Laplacian(gray, cv2.CV_64F).var())

    def _fix_exif(self, data: bytes, img: np.ndarray, mime: str) -> np.ndarray:
        if "pdf" in mime:
            return img
        try:
            pil  = Image.open(io.BytesIO(data))
            exif = pil._getexif()
            if exif:
                for tag, val in exif.items():
                    if ExifTags.TAGS.get(tag) == "Orientation":
                        angles = {3: 180, 6: 270, 8: 90}
                        if val in angles:
                            img = self._rotate(img, angles[val])
        except Exception:
            pass
        return img

    def _rotate(self, img: np.ndarray, angle: float) -> np.ndarray:
        h, w   = img.shape[:2]
        cx, cy = w // 2, h // 2
        M      = cv2.getRotationMatrix2D((cx, cy), -angle, 1.0)
        ac, _as = abs(M[0, 0]), abs(M[0, 1])
        nw = int(h * _as + w * ac)
        nh = int(h * ac  + w * _as)
        M[0, 2] += nw / 2 - cx
        M[1, 2] += nh / 2 - cy
        return cv2.warpAffine(img, M, (nw, nh),
                              flags=cv2.INTER_CUBIC,
                              borderMode=cv2.BORDER_REPLICATE)

    def _deskew(self, img: np.ndarray) -> Tuple[np.ndarray, float]:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blr  = cv2.GaussianBlur(gray, (9, 9), 0)
        _, th = cv2.threshold(blr, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        coords = np.column_stack(np.where(th > 0))
        if len(coords) < 100:
            return img, 0.0
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        if 0.5 < abs(angle) < 15:
            return self._rotate(img, angle), angle
        return img, 0.0

    def _perspective_correct(self, img: np.ndarray) -> Tuple[bool, np.ndarray]:
        gray    = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges   = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 75, 200)
        cnts, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        cnts    = sorted(cnts, key=cv2.contourArea, reverse=True)[:5]
        img_area = img.shape[0] * img.shape[1]

        for cnt in cnts:
            peri   = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
            if len(approx) == 4 and cv2.contourArea(approx) > 0.25 * img_area:
                pts = approx.reshape(4, 2).astype(np.float32)
                return True, self._four_point_transform(img, pts)
        return False, img

    def _four_point_transform(self, img: np.ndarray, pts: np.ndarray) -> np.ndarray:
        s    = pts.sum(axis=1)
        diff = np.diff(pts, axis=1)
        rect = np.array([
            pts[np.argmin(s)],
            pts[np.argmin(diff)],
            pts[np.argmax(s)],
            pts[np.argmax(diff)],
        ], dtype=np.float32)
        tl, tr, br, bl = rect
        mw = int(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl)))
        mh = int(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl)))
        dst = np.array([[0, 0], [mw-1, 0], [mw-1, mh-1], [0, mh-1]], dtype=np.float32)
        return cv2.warpPerspective(
            img, cv2.getPerspectiveTransform(rect, dst), (mw, mh)
        )

    def _remove_shadow(self, img: np.ndarray) -> np.ndarray:
        """Background subtraction via channel-wise morphological dilation."""
        planes = []
        for ch in cv2.split(img):
            dilated = cv2.dilate(ch, np.ones((7, 7), np.uint8))
            bg      = cv2.medianBlur(dilated, 21)
            diff    = 255 - cv2.absdiff(ch, bg)
            planes.append(cv2.normalize(diff, None, 0, 255, cv2.NORM_MINMAX))
        return cv2.merge(planes)

    def _bilateral_filter(
        self,
        img: np.ndarray,
        d: int = 9,
        sigma_color: float = 75,
        sigma_space: float = 75,
    ) -> np.ndarray:
        """
        Edge-preserving noise reduction.
        Better than NLM for table images: keeps grid lines sharp while
        smoothing background noise inside cells.
        """
        return cv2.bilateralFilter(img, d, sigma_color, sigma_space)

    def _clahe(
        self,
        img: np.ndarray,
        clip_limit: float = 3.5,
        tile: Tuple[int, int] = (6, 6),
    ) -> np.ndarray:
        """Contrast Limited Adaptive Histogram Equalization on L channel (LAB)."""
        lab    = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        cl     = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile).apply(l)
        return cv2.cvtColor(cv2.merge([cl, a, b]), cv2.COLOR_LAB2BGR)

    def _ensure_resolution(
        self, img: np.ndarray, min_height: int = 1_800
    ) -> Tuple[np.ndarray, bool]:
        h, w = img.shape[:2]
        if h < min_height:
            scale = min_height / h
            img   = cv2.resize(img, (int(w * scale), min_height),
                               interpolation=cv2.INTER_LANCZOS4)
            return img, True
        return img, False

    def _adaptive_binarize(self, img: np.ndarray, blur_score: float = 200.0) -> np.ndarray:
        """
        Hybrid binarization:
          • Sharp images (blur ≥ 150): tight adaptive (blockSize=31, C=12)
          • Moderate blur (50–150):    wider adaptive (blockSize=51, C=18)
          • Very blurry (< 50):        maximum smoothing  (blockSize=71, C=22)

        For sharp images we also try Otsu and pick the result with better
        text-to-background contrast (histogram separation).
        """
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        if blur_score >= 150:
            block_size, c_val = 31, 12
        elif blur_score >= 50:
            block_size, c_val = 51, 18
        else:
            block_size, c_val = 71, 22

        if block_size % 2 == 0:
            block_size += 1

        adaptive = cv2.adaptiveThreshold(
            gray, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            blockSize=block_size,
            C=c_val,
        )

        # For sharp images also compute Otsu; use whichever has more white pixels
        # (text-to-background ratio heuristic — invoice backgrounds are mostly white)
        if blur_score >= 150:
            _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            if cv2.countNonZero(otsu) > cv2.countNonZero(adaptive):
                binary = otsu
            else:
                binary = adaptive
        else:
            binary = adaptive

        return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)

    def _morphological_fix(self, img: np.ndarray) -> np.ndarray:
        """
        Morphological closing (dilate then erode) to reconnect broken character
        strokes caused by low-quality camera captures or aggressive binarization.
        Uses a tiny 2×2 kernel to avoid merging adjacent characters.
        """
        gray  = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        kernel = np.ones((2, 2), np.uint8)
        closed = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel)
        return cv2.cvtColor(closed, cv2.COLOR_GRAY2BGR)

    def _sharpen(self, img: np.ndarray) -> np.ndarray:
        """Standard unsharp-mask via Laplacian kernel."""
        kernel = np.array([[0, -1, 0],
                           [-1, 5, -1],
                           [0, -1, 0]], dtype=np.float32)
        return cv2.filter2D(img, -1, kernel)

    def _sharpen_strong(self, img: np.ndarray) -> np.ndarray:
        """
        Stronger unsharp mask for colour-mode table-image pipeline.
        Subtracts a Gaussian-blurred version to amplify high-frequency edges,
        making small model-code characters crisper without halos.
        """
        blur   = cv2.GaussianBlur(img, (0, 0), sigmaX=1.5)
        sharp  = cv2.addWeighted(img, 1.8, blur, -0.8, 0)
        return np.clip(sharp, 0, 255).astype(np.uint8)
