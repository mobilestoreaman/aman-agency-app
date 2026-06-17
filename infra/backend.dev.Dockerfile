# ============================================================
# Backend — Dev Dockerfile (Air hot reload)
# ============================================================

FROM golang:1.22

# Install system utilities and the standalone OCR stack.
# tesseract-ocr      : open-source OCR engine — no API key or subscription needed.
# tesseract-ocr-eng  : English language data (add -hin, -osd etc. for other languages).
# poppler-utils      : pdftoppm converts PDF pages to JPEG at 300 DPI for OCR input.
# imagemagick        : optional image enhancement (deskew, denoise, contrast boost).
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl git ca-certificates tzdata \
      tesseract-ocr tesseract-ocr-eng \
      poppler-utils \
      imagemagick \
    && rm -rf /var/lib/apt/lists/*

# Install Air using the official install script.
# This downloads a pre-built binary from GitHub Releases — it does NOT use
# the Go module proxy (proxy.golang.org) or the checksum database, so it
# succeeds in environments where 'go install' fails due to network restrictions.
RUN curl -sSfL https://raw.githubusercontent.com/air-verse/air/master/install.sh \
    | sh -s -- -b /usr/local/bin

WORKDIR /app

# Pre-download module dependencies at image-build time so that
# the first `air` startup doesn't wait for a full `go mod download`.
# The actual source is volume-mounted at runtime for hot reload.
COPY backend/go.mod backend/go.sum ./
RUN go mod download

EXPOSE 3000

# Air config (.air.toml) is provided by the mounted source volume.
CMD ["air", "-c", ".air.toml"]
