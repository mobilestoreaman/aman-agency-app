# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM python:3.10-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    libgcc-s1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Build context is the repo root (context: .. in docker-compose.yml)
COPY ocr-service/requirements.txt .

# Install Python deps into /install so we copy only them in the next stage
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive

# System libraries required at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    poppler-utils \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    libgcc-s1 \
    ca-certificates \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Non-root user created before COPY/chown steps
RUN useradd -m -u 1001 ocr

WORKDIR /app

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy ONLY the ocr-service source — not the whole repo
# (build context is repo root, so prefix with ocr-service/)
COPY ocr-service/ .

# Remove any stale compiled bytecode that snuck in through the COPY above.
# PYTHONDONTWRITEBYTECODE=1 prevents NEW ones from being written at runtime.
RUN find /app -name "*.pyc" -delete && find /app -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

# PaddleOCR always writes model weights to ~/.paddleocr (i.e. /home/ocr/.paddleocr
# when running as the non-root "ocr" user).  The docker-compose volume
# paddle_models is mounted there so ~700 MB of det+rec weights survive
# container rebuilds and are only downloaded once on cold start.
# The old PADDLE_HOME=/opt/paddleocr env var was wrong — PaddleOCR ignores it.
RUN mkdir -p /home/ocr/.paddleocr && chown -R ocr:ocr /app /home/ocr

USER ocr

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8001

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
