"""
Multi-pass OCR engine — Layer 2 / 3 / 4 of the new spatial-clustering pipeline.

Design principle (new architecture):
  PaddleOCR full-image is the PRIMARY text source — it always runs first and
  is guaranteed to produce text blocks regardless of PP-Structure behaviour.
  PP-Structure is ADDITIVE: it refines layout when it works, but its failure
  never causes data loss because PaddleOCR has already captured everything.

Pass order:
  1  PaddleOCR full-image  → ALL text blocks with bounding boxes (primary)
  2  Spatial table clustering → table rows built from coordinate math only
     (no HTML dependency — works on every image)
  3  PP-Structure layout    → if HTML table is produced, prepend it (higher
     confidence); if it fails, rescued text is merged into text_blocks
  4  Tesseract fallback     → when PaddleOCR initialisation itself fails

Why spatial clustering beats HTML-first:
  PP-Structure silently loses entire table regions when its HTML parser fails.
  Spatial clustering works purely from bounding boxes — it is immune to that
  failure mode and correctly handles Samsung's multi-line device format
  (model-code row → noise row → Batch/IMEI row, all in the same device item).
"""

import logging
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ── Lazy-loaded singletons (avoid slow import at process start) ───────────────
_paddle_ocr   = None
_pp_structure = None


def _get_paddle() -> Optional[object]:
    global _paddle_ocr
    if _paddle_ocr is None:
        try:
            from paddleocr import PaddleOCR
            _paddle_ocr = PaddleOCR(
                # use_angle_cls=False: the CLS model (angle classification) is
                # only needed for upside-down or sideways text.  Invoice photos
                # taken in the scan wizard are already upright; the preprocessor
                # handles any residual skew.  Disabling this prevents the cls
                # model download and avoids the /home/ocr/.paddleocr/.../cls.tar
                # "No such file or directory" crash on container cold-start.
                use_angle_cls=False,
                lang="en",
                use_gpu=False,
                show_log=False,
                enable_mkldnn=False,   # more stable on CPU-only containers
                det_db_box_thresh=0.3,
                det_db_unclip_ratio=2.0,
                rec_algorithm="SVTR_LCNet",
            )
            logger.info("PaddleOCR initialised")
        except Exception as exc:
            logger.error("PaddleOCR init failed: %s", exc)
    return _paddle_ocr


def _get_structure() -> Optional[object]:
    global _pp_structure
    if _pp_structure is None:
        try:
            from paddleocr import PPStructure
            _pp_structure = PPStructure(
                show_log=False,
                # image_orientation=False: also uses the CLS model internally;
                # our preprocessor handles orientation so this is not needed.
                image_orientation=False,
                layout=True,
                table=True,
            )
            logger.info("PP-Structure initialised")
        except Exception as exc:
            logger.error("PP-Structure init failed: %s", exc)
    return _pp_structure


# ── Type aliases ──────────────────────────────────────────────────────────────

TextBlock  = Dict   # {text, bbox, confidence}
TableBlock = Dict   # {rows, bbox, type}  or  {html, cells, bbox}


class OCREngine:
    """
    Orchestrates the spatial-clustering OCR strategy.

    Returns:
        text_blocks  — list of {text, bbox, confidence} (from PaddleOCR)
        table_blocks — list of table dicts (spatial first, HTML if PP-Structure works)
        meta         — processing diagnostics
    """

    # Minimum confidence for PaddleOCR result to be accepted
    CONF_GATE = 0.60

    def extract(
        self, img: np.ndarray
    ) -> Tuple[List[TextBlock], List[TableBlock], dict]:
        meta: dict = {}

        # ── Pass 1: Full-image PaddleOCR — primary text source ────────────────
        # This ALWAYS runs first and is the authoritative text source.
        # Every piece of text on the page ends up here regardless of what
        # PP-Structure does later.
        text_blocks = self._run_paddle(img)
        meta["paddle_blocks_primary"] = len(text_blocks)

        # ── Pass 2: Spatial table clustering ─────────────────────────────────
        # Build a table purely from bounding-box coordinate math.
        # No HTML parsing, no PP-Structure dependency — works on every image.
        table_blocks: List[TableBlock] = []
        spatial_table = self._spatial_cluster_table(text_blocks)
        if spatial_table:
            table_blocks.append(spatial_table)
            meta["spatial_table"]     = True
            meta["spatial_rows"]      = len(spatial_table.get("rows", []))
            logger.info(
                "Spatial table: %d rows (type=%s)",
                meta["spatial_rows"], spatial_table.get("type", "?"),
            )
        else:
            meta["spatial_table"] = False
            logger.info("Spatial clustering: no multi-column table detected")

        # ── Pass 3: PP-Structure — additive layout layer ──────────────────────
        # Run PP-Structure for layout analysis.  If it produces a valid HTML
        # table, insert it at the front of table_blocks (higher confidence than
        # spatial clustering).  If it fails, we still have the spatial table.
        layout = self._run_structure(img)
        if layout:
            meta["layout_detected"] = True
            html_tables_found = 0

            for block in layout:
                btype = (block.get("type") or "").lower()

                if btype == "table":
                    tb = self._parse_table_block(block)
                    if tb:
                        # HTML table produced — insert at front (highest confidence)
                        table_blocks.insert(0, tb)
                        html_tables_found += 1
                    else:
                        # PP-Structure marked this as a table but HTML failed.
                        # Rescue any recoverable text so Strategy B in
                        # _infer_items() still has it.
                        rescued = self._rescue_text_from_table_block(block)
                        if rescued:
                            text_blocks = self._merge_blocks(text_blocks, rescued)
                            logger.info(
                                "Rescued %d blocks from failed table HTML", len(rescued)
                            )
                else:
                    # Non-table region: extract text and merge
                    extra = self._parse_text_block(block)
                    if extra:
                        text_blocks = self._merge_blocks(text_blocks, extra)

            meta["html_tables_found"]  = html_tables_found
            meta["layout_blocks"]      = len(layout)

        else:
            meta["layout_detected"] = False

        # ── Pass 4: Last resort — if no table at all, try text alignment ──────
        if not table_blocks:
            inferred = self._infer_table(text_blocks)
            if inferred:
                table_blocks = [inferred]
                meta["table_inferred"] = True
                logger.info("Table inferred from text alignment")

        meta["text_blocks_total"]  = len(text_blocks)
        meta["table_blocks_total"] = len(table_blocks)

        return text_blocks, table_blocks, meta

    # ── Spatial table clustering ──────────────────────────────────────────────

    def _spatial_cluster_table(
        self, blocks: List[TextBlock]
    ) -> Optional[TableBlock]:
        """
        Build a table from text blocks using only Y/X coordinate math.

        Algorithm:
          1. Sort all blocks by Y coordinate.
          2. Cluster into rows by Y-proximity (gap = 1.5% of image height).
          3. Within each row, sort blocks by X (left → right).
          4. Find the header row — the row with the most table-column keywords.
          5. Compute column X-anchors from the header row's block positions.
          6. For each data row, assign each block to the nearest column anchor.
          7. Single-cell rows (Samsung "without Adaptor", "Batch:") go to col 0
             so _merge_multiline_items() absorbs them as continuation rows.

        Returns a dict compatible with extractor._parse_rows():
          {"rows": List[List[TextBlock]], "type": "spatial", "bbox": None}
        where rows[0] is the header row, rows[1:] are column-aligned data rows.
        """
        if not blocks:
            return None

        # ── 1. Scale threshold from image height ──────────────────────────
        all_ys = []
        for b in blocks:
            if b.get("bbox"):
                all_ys.extend(p[1] for p in b["bbox"])
        if not all_ys:
            return None
        img_h    = max(all_ys)
        y_thresh = max(20, int(img_h * 0.015))   # ~1.5% of height

        # Estimate image width for right-edge expansion
        all_xs = []
        for b in blocks:
            if b.get("bbox"):
                all_xs.extend(p[0] for p in b["bbox"])
        img_w = max(all_xs) if all_xs else 2000

        # ── 2. Sort and cluster by Y ──────────────────────────────────────
        valid = [b for b in blocks if b.get("bbox")]
        if not valid:
            return None

        sorted_b = sorted(valid, key=lambda b: b["bbox"][0][1])

        raw_rows: List[List[TextBlock]] = []
        cur: List[TextBlock] = [sorted_b[0]]
        last_y = sorted_b[0]["bbox"][0][1]

        for b in sorted_b[1:]:
            y = b["bbox"][0][1]
            if abs(y - last_y) <= y_thresh:
                cur.append(b)
            else:
                raw_rows.append(sorted(cur, key=lambda x: x["bbox"][0][0]))
                cur    = [b]
                last_y = y
        if cur:
            raw_rows.append(sorted(cur, key=lambda x: x["bbox"][0][0]))

        # ── 3. Detect header row ──────────────────────────────────────────
        # Score each row by how many table-column keywords it contains.
        # At least 2 distinct keywords required to be considered a header.
        HEADER_KW = {
            # Description column
            "description", "particulars", "item", "product", "goods",
            "product name", "item name", "narration", "material", "details",
            # Qty column
            "qty", "quantity", "nos", "pcs", "units", "qnty", "count",
            # Price column
            "rate", "price", "unit price", "unit rate", "mrp", "basic rate",
            # Amount column
            "amount", "value", "total", "net amount", "amt",
            # HSN column
            "hsn", "sac", "hsn/sac", "hs code",
            # Tax column
            "gst", "tax",
            # S.No column
            "s.no", "sr", "sno", "sl no", "seq",
        }

        header_row_idx = None
        best_score     = 0.0

        for i, row in enumerate(raw_rows[:30]):   # scan first 30 rows
            row_text = " ".join(b.get("text", "").lower().strip() for b in row)
            kw_score = sum(1 for kw in HEADER_KW if kw in row_text)
            # Bonus for having multiple cells (more cells = more likely a header)
            cell_bonus = min(len(row) - 1, 3) * 0.4
            score = kw_score + cell_bonus
            if score >= 2.4 and score > best_score:
                best_score     = score
                header_row_idx = i

        # ── 4a. No header found — fall back to multi-column row detection ──
        if header_row_idx is None:
            multi_col = [r for r in raw_rows if len(r) >= 2]
            if len(multi_col) < 2:
                return None
            return {
                "rows":      multi_col,
                "_all_rows": raw_rows,
                "type":      "spatial_no_header",
                "bbox":      None,
            }

        header_row = raw_rows[header_row_idx]
        data_rows  = raw_rows[header_row_idx + 1:]

        if not data_rows:
            return None

        # ── 4b. Compute column X-anchors from header row ──────────────────
        n_cols      = len(header_row)
        col_anchors = []
        for block in header_row:
            bbox     = block["bbox"]
            x_left   = min(p[0] for p in bbox)
            x_right  = max(p[0] for p in bbox)
            x_center = (x_left + x_right) / 2.0
            col_anchors.append({
                "x_left":   x_left,
                "x_right":  x_right,
                "x_center": x_center,
            })
        # Expand first/last column to page edges so partial blocks aren't lost
        if col_anchors:
            col_anchors[0]["x_left"]   = 0
            col_anchors[-1]["x_right"] = img_w

        def _assign_col(block: TextBlock) -> int:
            """Find best column index for a block by X-center proximity."""
            bbox      = block["bbox"]
            bx_center = (min(p[0] for p in bbox) + max(p[0] for p in bbox)) / 2.0
            best_dist = float("inf")
            best_idx  = 0
            for ci, anchor in enumerate(col_anchors):
                dist = abs(anchor["x_center"] - bx_center)
                if dist < best_dist:
                    best_dist = dist
                    best_idx  = ci
            return best_idx

        _EMPTY_BLOCK = {
            "text": "", "confidence": 0.0,
            "bbox": [[0, 0], [0, 0], [0, 0], [0, 0]],
        }

        # ── 5. Align data rows to header columns ──────────────────────────
        aligned_rows: List[List[TextBlock]] = [header_row]  # row 0 = header

        for row in data_rows:
            if not row:
                continue

            # Single-cell continuation row (e.g. "without Adaptor", "Batch: …")
            # → force into column 0 (description); leave other columns empty.
            # _merge_multiline_items() will absorb it into the preceding item.
            if len(row) == 1:
                padded = [row[0]] + [dict(_EMPTY_BLOCK) for _ in range(n_cols - 1)]
                aligned_rows.append(padded)
                continue

            # Multi-cell row → assign each block to nearest column anchor
            grid: List[Optional[TextBlock]] = [None] * n_cols
            for block in row:
                ci = _assign_col(block)
                if grid[ci] is None:
                    grid[ci] = block
                else:
                    # Two blocks mapped to same column → merge text
                    merged = dict(grid[ci])
                    merged["text"] = (
                        (grid[ci].get("text") or "") + " " + (block.get("text") or "")
                    ).strip()
                    merged["confidence"] = min(
                        grid[ci].get("confidence", 0.5),
                        block.get("confidence", 0.5),
                    )
                    grid[ci] = merged

            aligned_rows.append([b or dict(_EMPTY_BLOCK) for b in grid])

        # Need at least header + 1 data row
        if len(aligned_rows) < 2:
            return None

        logger.info(
            "Spatial cluster: header at row %d, %d cols, %d data rows",
            header_row_idx, n_cols, len(aligned_rows) - 1,
        )

        return {
            "rows":      aligned_rows,
            "_all_rows": aligned_rows,   # spatial rows are already full (no split needed)
            "type":      "spatial",
            "bbox":      None,
        }

    # ── PP-Structure passes ───────────────────────────────────────────────────

    def _run_structure(self, img: np.ndarray) -> Optional[list]:
        try:
            s = _get_structure()
            return s(img) if s else None
        except Exception as exc:
            logger.warning("PP-Structure failed: %s", exc)
            return None

    def _run_paddle(self, img: np.ndarray) -> List[TextBlock]:
        """PaddleOCR full-image pass — returns text blocks sorted by Y."""
        try:
            ocr = _get_paddle()
            if ocr is None:
                return self._run_tesseract(img)
            result = ocr.ocr(img, cls=False)   # cls=False matches use_angle_cls=False
            blocks = []
            if result and result[0]:
                for line in result[0]:
                    if line and len(line) >= 2:
                        bbox, (text, conf) = line[0], line[1]
                        if str(text).strip():
                            blocks.append({
                                "text":       str(text).strip(),
                                "bbox":       bbox,
                                "confidence": float(conf),
                            })
            return sorted(
                blocks, key=lambda b: b["bbox"][0][1] if b.get("bbox") else 0
            )
        except Exception as exc:
            logger.warning("PaddleOCR failed, using Tesseract: %s", exc)
            return self._run_tesseract(img)

    def _run_tesseract(self, img: np.ndarray) -> List[TextBlock]:
        """Tesseract fallback — used when PaddleOCR is unavailable."""
        try:
            import pytesseract
            data = pytesseract.image_to_data(
                img,
                output_type=pytesseract.Output.DICT,
                config="--psm 6 --oem 1 -l eng",
            )
            blocks = []
            for i, text in enumerate(data["text"]):
                text = str(text).strip()
                conf = int(data["conf"][i])
                if text and conf > 20:
                    x, y, w, h = (
                        data["left"][i], data["top"][i],
                        data["width"][i], data["height"][i],
                    )
                    blocks.append({
                        "text":       text,
                        "bbox":       [[x, y], [x+w, y], [x+w, y+h], [x, y+h]],
                        "confidence": conf / 100.0,
                    })
            return blocks
        except Exception as exc:
            logger.error("Tesseract also failed: %s", exc)
            return []

    # ── Block parsing ─────────────────────────────────────────────────────────

    def _rescue_text_from_table_block(self, block: dict) -> List[TextBlock]:
        """
        When _parse_table_block() fails (empty HTML / non-dict res), attempt to
        salvage text from the table block so it ends up in flat_lines and
        Strategy B in extractor._infer_items() can still see model codes.

        Strategy A: strip HTML tags from the HTML string and recover raw text.
        Strategy B: (text is already in PaddleOCR primary blocks — not needed)
        """
        rescued: List[TextBlock] = []
        res  = block.get("res") or {}
        html = res.get("html", "") if isinstance(res, dict) else ""

        if html:
            import re as _re
            text_only = _re.sub(r"<[^>]+>", " ", html)
            chunks    = [c.strip() for c in _re.split(r"\s{2,}|\n", text_only) if c.strip()]
            for i, chunk in enumerate(chunks):
                if len(chunk) > 1:
                    rescued.append({
                        "text":       chunk,
                        "bbox":       [[0, i * 30], [200, i * 30],
                                       [200, (i + 1) * 30], [0, (i + 1) * 30]],
                        "confidence": 0.70,
                        "_source":    "table_html_rescue",
                    })

        return rescued

    def _parse_text_block(self, block: dict) -> List[TextBlock]:
        blocks = []
        res = block.get("res", [])
        if isinstance(res, list):
            for item in res:
                if isinstance(item, list) and len(item) >= 2:
                    bbox, payload = item[0], item[1]
                    if isinstance(payload, (list, tuple)) and len(payload) >= 2:
                        text, conf = str(payload[0]).strip(), float(payload[1])
                        if text:
                            blocks.append({"text": text, "bbox": bbox, "confidence": conf})
        return blocks

    def _parse_table_block(self, block: dict) -> Optional[TableBlock]:
        res = block.get("res")
        if not isinstance(res, dict):
            return None
        html  = res.get("html", "")
        cells = res.get("cell_bbox", [])
        bbox  = block.get("bbox")
        if html:
            return {"html": html, "cells": cells, "bbox": bbox}
        return None

    # ── Text-alignment table inference (last resort) ──────────────────────────

    def _infer_table(self, blocks: List[TextBlock]) -> Optional[TableBlock]:
        """
        Group text blocks into rows by Y-proximity, then identify a table
        as the region with ≥ 2 consecutive rows each having ≥ 2 columns.

        This is a last resort — spatial_cluster_table() should catch most cases.
        y_thresh scales with image height so it works at any resolution.
        """
        if not blocks:
            return None

        all_ys = []
        for b in blocks:
            if b.get("bbox"):
                all_ys.extend(p[1] for p in b["bbox"])
        img_h    = max(all_ys) if all_ys else 1000
        y_thresh = max(20, int(img_h * 0.015))

        sorted_b = sorted(
            blocks, key=lambda b: b["bbox"][0][1] if b.get("bbox") else 0
        )

        rows: List[List[TextBlock]] = []
        cur:  List[TextBlock]       = [sorted_b[0]]
        last_y = sorted_b[0]["bbox"][0][1] if sorted_b[0].get("bbox") else 0

        for b in sorted_b[1:]:
            y = b["bbox"][0][1] if b.get("bbox") else 0
            if abs(y - last_y) <= y_thresh:
                cur.append(b)
            else:
                rows.append(
                    sorted(cur, key=lambda x: x["bbox"][0][0] if x.get("bbox") else 0)
                )
                cur    = [b]
                last_y = y
        if cur:
            rows.append(
                sorted(cur, key=lambda x: x["bbox"][0][0] if x.get("bbox") else 0)
            )

        table_rows = [r for r in rows if len(r) >= 2]
        if len(table_rows) < 2:
            return None

        return {"rows": table_rows, "type": "inferred", "bbox": None, "_all_rows": rows}

    # ── Block merge (deduplicate by Y overlap) ────────────────────────────────

    def _merge_blocks(
        self, base: List[TextBlock], additions: List[TextBlock]
    ) -> List[TextBlock]:
        """
        Add blocks from `additions` that don't substantially overlap with
        any block already in `base` (prevents duplicate text from PP-Structure
        re-OCR and PaddleOCR primary pass appearing twice).
        """
        def bbox_y(b: TextBlock) -> Tuple[float, float]:
            bb = b.get("bbox", [[0, 0]])
            ys = [p[1] for p in bb]
            return min(ys), max(ys)

        def overlaps(a: TextBlock, b: TextBlock) -> bool:
            ay0, ay1 = bbox_y(a)
            by0, by1 = bbox_y(b)
            overlap  = min(ay1, by1) - max(ay0, by0)
            height   = min(ay1 - ay0, by1 - by0)
            return height > 0 and overlap / height > 0.5

        result = list(base)
        for new_b in additions:
            if not any(overlaps(new_b, ex) for ex in result):
                result.append(new_b)
        return result
