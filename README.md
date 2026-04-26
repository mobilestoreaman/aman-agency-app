# Aman Agency — Mobile Store Management System

A full-stack PWA for managing a mobile phone retail agency. Built with **Go + Fiber** (backend), **React + Vite** (frontend), and **MongoDB** — packaged with Docker for one-command startup.

---

## Features

- **Dashboard** — Real-time KPIs: today's sales, revenue, outstanding credit, stock levels, borrow/lends, notifications
- **Inventory (Devices)** — IMEI-level device tracking with status lifecycle (available → sold / reserved / under repair)
- **Barcode Scanning** — Camera + external Bluetooth scanner support via BarcodeDetector Web API
- **Sales** — Full invoice workflow: create sale, item picker, partial payment / credit tracking
- **Bills** — Printable HTML invoices generated server-side; optional WhatsApp delivery via Twilio
- **Customers** — CRM with credit ledger, full sales history per customer
- **Borrow/Lends** — Track device loans with due-date enforcement and overdue alerts
- **Loan References** — Track bank EMI loans (Bajaj/HDFC/ICICI/Axis/IDFC/TVS Credit) linked to customers
- **Expenses** — Record and categorise business expenses
- **Notifications** — In-app alerts for overdue items, low stock, credit thresholds
- **Auth** — JWT access + refresh tokens, role-based access (Admin / Staff)
- **PWA** — Installable on Android/iOS; offline-capable via Workbox service worker
- **Swagger UI** — Interactive API docs at `/api/swagger/index.html`

---

## Tech Stack

| Layer          | Technology                                                                           |
|----------------|--------------------------------------------------------------------------------------|
| Backend        | Go 1.22, Fiber v2, MongoDB 7, JWT, Zerolog                                           |
| Frontend       | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query v5, Zustand      |
| Database       | MongoDB 7                                                                            |
| Reverse proxy  | Nginx (routes `/api/*` → backend, `/` → frontend)                                   |
| Container      | Docker, Docker Compose                                                               |

---

## Prerequisites

| Tool                       | Minimum version | Install link                          |
|----------------------------|-----------------|---------------------------------------|
| Docker                     | 24+             | https://docs.docker.com/get-docker/   |
| Docker Compose             | v2 (plugin)     | Bundled with Docker Desktop           |
| Go *(local dev only)*      | 1.22            | https://go.dev/dl/                    |
| Node.js *(local dev only)* | 20 LTS          | https://nodejs.org/                   |
| `make`                     | any             | Pre-installed on macOS/Linux          |
| `openssl`                  | any             | Pre-installed on macOS/Linux          |

---

## Local Development

Two options: **Docker (recommended)** — everything runs in containers with hot-reload, or **bare-metal** — run each service directly on your machine.

---

### Option 1 — Docker (Recommended)

The fastest way to get running. Requires only Docker and `make`.

#### Step 1 — Clone the repository

```bash
git clone <repo-url> aman-agency-app
cd aman-agency-app
```

#### Step 2 — Create the environment file

```bash
cp backend/.env.example backend/.env
```

#### Step 3 — Generate secrets

```bash
make gen-secret
```

Copy the two printed values into `backend/.env`:

```env
# backend/.env

# ── Required ──────────────────────────────────────────────────
MONGO_URI=mongodb://mongo:27017        # "mongo" is the Docker service hostname
MONGO_DB=aman_agency

JWT_SECRET=<paste the JWT_SECRET value here>
ENCRYPTION_KEY=<paste the ENCRYPTION_KEY value here>

# ── Optional (defaults shown) ──────────────────────────────────
APP_ENV=development
APP_PORT=3000
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=168h
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
WA_PROVIDER=noop                        # set to "twilio" to enable WhatsApp
PDF_STORAGE_PATH=/app/storage/invoices
STATIC_BASE_URL=http://localhost/static
LOG_LEVEL=info
```

#### Step 4 — Start all services

```bash
make dev
```

This builds and starts four containers with live-reload:

| Container   | Description                        | Port           |
|-------------|-------------------------------------|----------------|
| `mongo`     | MongoDB 7                           | `27017`        |
| `backend`   | Go + Fiber (Air hot-reload)         | `3000`         |
| `frontend`  | React + Vite (HMR)                  | `5173`         |
| `nginx`     | Reverse proxy                       | `80`           |

> **First run:** Docker pulls images and builds containers — allow 3–5 minutes.

Wait for these lines before continuing:

```
backend  | ✓ MongoDB connected
backend  | ✓ Server listening on :3000
frontend | VITE ready in ...ms
```

#### Step 5 — Seed the database (first run only)

Open a **new terminal** while the stack is running:

```bash
make mongo-seed
```

This creates the default admin account. The generated password is printed **once** — copy it immediately.

| Env override            | Default value                  |
|-------------------------|--------------------------------|
| `SEED_ADMIN_NAME`       | `Admin`                        |
| `SEED_ADMIN_EMAIL`      | `admin@amanagency.com`         |
| `SEED_ADMIN_PASSWORD`   | Auto-generated (shown once)    |

#### Step 6 — Open the app

| URL                                         | What                           |
|---------------------------------------------|--------------------------------|
| http://localhost                            | React PWA (via Nginx)          |
| http://localhost:5173                       | Vite dev server (direct, HMR)  |
| http://localhost:3000/api/swagger/index.html| Swagger API docs               |
| http://localhost/api/health                 | Health check (no auth)         |

Log in with `admin@amanagency.com` and the password printed by the seed command.

---

### Option 2 — Bare-Metal (No Docker)

Run MongoDB, the Go backend, and the Vite dev server directly on your machine.

#### Prerequisites

- MongoDB 7 running locally on port `27017`
- Go 1.22 installed (`go version`)
- Node.js 20+ installed (`node --version`)
- `air` for Go hot-reload: `go install github.com/cosmtrek/air@latest`

#### Step 1 — Clone and configure

```bash
git clone <repo-url> aman-agency-app
cd aman-agency-app

cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
MONGO_URI=mongodb://localhost:27017    # point to your local MongoDB
MONGO_DB=aman_agency
JWT_SECRET=<output of: openssl rand -hex 64>
ENCRYPTION_KEY=<output of: openssl rand -hex 32>
APP_ENV=development
CORS_ALLOWED_ORIGINS=http://localhost:5173
WA_PROVIDER=noop
PDF_STORAGE_PATH=./storage/invoices
STATIC_BASE_URL=http://localhost:3000/static
```

Or use the Makefile helper to generate secrets:

```bash
make gen-secret
```

#### Step 2 — Start the backend

```bash
make dev-backend
# or: cd backend && air
```

Backend starts at http://localhost:3000.

#### Step 3 — Start the frontend

In a **new terminal**:

```bash
cd frontend
npm install
npm run dev
```

Frontend starts at http://localhost:5173. Vite automatically proxies `/api` requests to `http://localhost:3000`.

#### Step 4 — Seed the database (first run only)

In a **new terminal** while the backend is running:

```bash
make mongo-seed
```

Copy the printed admin password.

#### All services running

| Service   | URL                              |
|-----------|----------------------------------|
| Backend   | http://localhost:3000            |
| Frontend  | http://localhost:5173            |
| Swagger   | http://localhost:3000/api/swagger/index.html |
| Health    | http://localhost:3000/api/health |

---

## Production Deployment

### Prerequisites

- A Linux VPS (Ubuntu 22.04+ recommended) with Docker and Docker Compose v2 installed
- A domain name pointing to your server's IP
- Ports `80` and `443` open in your firewall

### Step 1 — Clone onto the server

```bash
git clone <repo-url> aman-agency-app
cd aman-agency-app
```

### Step 2 — Configure the production environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with production values:

```env
# ── Application ────────────────────────────────────────────────
APP_ENV=production
APP_PORT=3000
APP_VERSION=1.0.0              # set to your release version

# ── MongoDB ────────────────────────────────────────────────────
# Option A — Docker Compose MongoDB (same network):
MONGO_URI=mongodb://admin:<password>@mongo:27017/aman_agency?authSource=admin
MONGO_DB=aman_agency

# Option B — MongoDB Atlas:
# MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/aman_agency

# ── Secrets — MUST be changed from defaults ────────────────────
JWT_SECRET=<openssl rand -hex 64>
ENCRYPTION_KEY=<openssl rand -hex 32>

JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=168h

# ── CORS — set to your actual domain ──────────────────────────
CORS_ALLOWED_ORIGINS=https://yourdomain.com

# ── PDF / Invoices ─────────────────────────────────────────────
PDF_STORAGE_PATH=/app/storage/invoices
STATIC_BASE_URL=https://yourdomain.com/static

# ── WhatsApp (optional) ────────────────────────────────────────
WA_PROVIDER=noop               # switch to "twilio" when ready
WA_API_KEY=
WA_FROM_NUMBER=

# ── Logging ────────────────────────────────────────────────────
LOG_LEVEL=warn
```

> **Security:** Never commit `backend/.env` to version control. The `.gitignore` already excludes it.

Generate secrets if you haven't already:

```bash
make gen-secret
```

### Step 3 — Set your domain in the Nginx config

Edit `infra/nginx/conf.d/ssl.conf` and replace every occurrence of `yourdomain.com` with your actual domain.

### Step 4 — Initialise SSL certificates

Run the SSL init script (requires your domain to already point to this server):

```bash
chmod +x scripts/init-ssl.sh
sudo ./scripts/init-ssl.sh yourdomain.com admin@yourdomain.com
```

This uses Certbot to obtain a Let's Encrypt certificate. The `certbot` container in the compose stack handles auto-renewal every 12 hours.

### Step 5 — Deploy the production stack

```bash
make prod
```

This runs `docker compose -f infra/docker-compose.prod.yml up --build -d` which applies:

- **Resource limits** per container (CPU + RAM caps)
- **JSON log rotation** (max 10–20 MB per file, 2–5 files retained)
- `APP_ENV=production` in the backend
- `GOGC=80` and `GOMAXPROCS=1` for efficient Go memory management

### Step 6 — Seed the database

```bash
make mongo-seed
```

Copy the admin password from the output.

### Step 7 — Verify deployment

```bash
# Check all containers are healthy
make ps

# Check backend logs
make logs

# Confirm health endpoint responds
curl -s https://yourdomain.com/api/health

# Expected response:
# {"status":"ok","version":"1.0.0","env":"production"}
```

### Step 8 — Open the app

| URL                                              | What                  |
|--------------------------------------------------|-----------------------|
| https://yourdomain.com                           | React PWA (HTTPS)     |
| https://yourdomain.com/api/swagger/index.html    | Swagger API docs      |
| https://yourdomain.com/api/health                | Health check          |

---

## Without SSL (HTTP Only)

If you don't have a domain or want to skip SSL for now, use the base compose stack:

```bash
make up       # starts on http only (port 80)
make ps       # check status
make logs     # tail backend logs
make down     # stop everything
```

Access the app at `http://<server-ip>`.

---

## Environment Variables Reference

All variables live in `backend/.env`. Copy from `backend/.env.example`.

### Required

| Variable          | Description                                                       |
|-------------------|-------------------------------------------------------------------|
| `MONGO_URI`       | MongoDB connection URI (`mongo` hostname in Docker, `localhost` bare-metal, or Atlas SRV) |
| `MONGO_DB`        | Database name, e.g. `aman_agency`                                 |
| `JWT_SECRET`      | Random 64-char hex string — generate with `make gen-secret`       |
| `ENCRYPTION_KEY`  | Random 32-byte / 64 hex char AES-GCM key — `make gen-secret`     |

### Application

| Variable       | Default        | Description                       |
|----------------|----------------|-----------------------------------|
| `APP_ENV`      | `development`  | `production` or `development`     |
| `APP_PORT`     | `3000`         | HTTP listen port                  |
| `APP_VERSION`  | `dev`          | Shown in `/api/health` response   |

### JWT

| Variable           | Default  | Description                       |
|--------------------|----------|-----------------------------------|
| `JWT_ACCESS_TTL`   | `15m`    | Access token lifetime             |
| `JWT_REFRESH_TTL`  | `168h`   | Refresh token lifetime (7 days)   |

### CORS

| Variable                | Default                                          | Description                              |
|-------------------------|--------------------------------------------------|------------------------------------------|
| `CORS_ALLOWED_ORIGINS`  | `http://localhost:5173,http://localhost:3000`    | Comma-separated list of allowed origins  |

Set to your domain in production: `CORS_ALLOWED_ORIGINS=https://yourdomain.com`

### WhatsApp (optional)

| Variable          | Description                                         |
|-------------------|-----------------------------------------------------|
| `WA_PROVIDER`     | `twilio` or `noop` (set `noop` to disable)          |
| `WA_API_KEY`      | Twilio Auth Token                                   |
| `WA_FROM_NUMBER`  | Sender WhatsApp number in E.164 format (+91XXXXXX)  |

### PDF / Storage

| Variable             | Default                        | Description                                 |
|----------------------|--------------------------------|---------------------------------------------|
| `PDF_STORAGE_PATH`   | `/app/storage/invoices`        | Absolute path where invoice PDFs are saved  |
| `STATIC_BASE_URL`    | `http://localhost/static`      | Public URL prefix for serving stored files  |

### Logging

| Variable     | Default  | Options                                             |
|--------------|----------|-----------------------------------------------------|
| `LOG_LEVEL`  | `info`   | `trace` / `debug` / `info` / `warn` / `error` / `fatal` |

### Frontend

Create `frontend/.env.local` to override Vite settings (optional — Vite proxy handles this automatically in dev):

```env
VITE_API_BASE_URL=      # empty = Vite proxy forwards /api → localhost:3000
VITE_APP_NAME=Aman Agency
```

In the production Docker build this is baked in at build time as `VITE_API_BASE_URL=/api`.

---

## Make Targets Reference

Run `make help` to list all targets.

```
# Development
make dev             Start full stack in dev mode (Docker + hot-reload)
make dev-backend     Run backend only with Air hot-reload (requires local Go)
make run             Build then run backend binary directly

# Docker
make up              Start all services in background (HTTP only)
make down            Stop and remove all containers
make prod            Deploy production stack with resource limits and logging
make logs            Tail backend container logs
make ps              Show running containers

# Database
make mongo-seed      Create default admin user (run once after first start)
make mongo-shell     Open mongosh inside the running mongo container

# Testing & Quality
make test            Run all backend tests with race detection
make test-verbose    Run tests with verbose output
make test-cover      Generate HTML coverage report
make lint            Run golangci-lint
make fmt             Format all Go source files
make vet             Run go vet
make tidy            Tidy Go module dependencies

# Utilities
make gen-secret      Generate JWT_SECRET and ENCRYPTION_KEY values
make docs            Regenerate Swagger docs (requires swag CLI)
make swagger         Open Swagger UI in browser (app must be running)
make health          Check /api/health and print JSON response
make env             Copy .env.example to .env (skips if .env exists)
make clean           Remove compiled binaries and coverage artifacts
```

---

## Project Structure

```
aman-agency-app/
├── backend/                      Go application (Clean Architecture)
│   ├── cmd/
│   │   ├── server/main.go        Entry point — loads config, connects DB, starts Fiber
│   │   └── scripts/seed/main.go  One-shot DB seeder (creates admin user)
│   ├── internal/
│   │   ├── config/               Environment variable loader (panics on missing required vars)
│   │   ├── controller/           HTTP handlers (one file per resource)
│   │   ├── dto/                  Request / Response structs (JSON tags)
│   │   ├── middleware/           JWT auth, RBAC, rate limiting, error handler
│   │   ├── models/               MongoDB document models (BSON tags)
│   │   ├── repository/           MongoDB queries (data access layer)
│   │   ├── routes/               Route registration and middleware wiring
│   │   └── service/              Business logic layer
│   ├── platform/
│   │   ├── database/             MongoDB connection pool + index migration
│   │   ├── pdf/                  HTML invoice renderer (html/template)
│   │   └── whatsapp/             Provider abstraction (Twilio / noop)
│   ├── docs/                     Swagger files (auto-generated by swag)
│   ├── pkg/                      Shared utilities (apperror, pagination, response, validator)
│   ├── .air.toml                 Air hot-reload config (watches .go, .html, .tpl)
│   ├── .env.example              Environment variable template
│   └── go.mod
│
├── frontend/                     React PWA
│   ├── src/
│   │   ├── api/                  Axios API clients (one file per resource)
│   │   ├── components/           Reusable UI components (shadcn/ui based)
│   │   ├── hooks/                TanStack Query hooks (one file per resource)
│   │   ├── pages/                Route-level page components
│   │   ├── router/               React Router v6 route definitions
│   │   ├── store/                Zustand global state (auth, theme)
│   │   ├── types/                TypeScript interfaces (mirror backend DTOs exactly)
│   │   └── utils/                Formatters: currency, date
│   ├── public/                   PWA icons (192×192, 512×512), site.webmanifest
│   ├── vite.config.ts            Vite + PWA plugin + /api proxy config
│   └── package.json
│
├── infra/                        Infrastructure
│   ├── docker-compose.yml        Base compose (HTTP, no resource limits)
│   ├── docker-compose.dev.yml    Dev overrides (bind-mounts, hot-reload, exposed ports)
│   ├── docker-compose.prod.yml   Production compose (resource limits, log rotation)
│   ├── backend.Dockerfile        Multi-stage production build (~12 MB Alpine image)
│   ├── backend.dev.Dockerfile    Dev build with Air
│   ├── frontend.Dockerfile       Multi-stage Node build → Nginx static server
│   ├── frontend.dev.Dockerfile   Vite dev server (--host 0.0.0.0)
│   └── nginx/
│       ├── nginx.conf            Global Nginx config (gzip, rate-limit zones, headers)
│       └── conf.d/
│           ├── default.conf      HTTP reverse proxy (port 80)
│           ├── frontend.conf     SPA fallback + asset caching for frontend container
│           └── ssl.conf          HTTPS/TLS config (port 443, Let's Encrypt, HSTS)
│
├── scripts/
│   ├── init-ssl.sh               Certbot Let's Encrypt certificate initialisation
│   └── setup.sh                  Initial project setup helper
│
└── Makefile                      Developer workflow automation (30+ targets)
```

---

## API Documentation

Swagger UI is available at:

```
http://localhost/api/swagger/index.html          # dev (via Nginx)
http://localhost:3000/api/swagger/index.html     # dev (direct to backend)
https://yourdomain.com/api/swagger/index.html   # production
```

All endpoints are prefixed `/api/v1/`. Authentication uses Bearer tokens:

```
Authorization: Bearer <access_token>
```

### Key Endpoints

| Method | Path                                  | Description                                   | Role   |
|--------|---------------------------------------|-----------------------------------------------|--------|
| POST   | `/api/v1/auth/login`                  | Login → returns access + refresh tokens       | Public |
| POST   | `/api/v1/auth/refresh`                | Refresh access token                          | Public |
| GET    | `/api/v1/dashboard`                   | Dashboard KPIs and summaries                  | Staff  |
| GET    | `/api/v1/devices`                     | List devices (paginated, filterable)          | Staff  |
| POST   | `/api/v1/devices`                     | Add device with IMEI                          | Admin  |
| PATCH  | `/api/v1/devices/:id`                 | Update device                                 | Admin  |
| GET    | `/api/v1/sales`                       | List sales                                    | Staff  |
| POST   | `/api/v1/sales`                       | Create sale                                   | Staff  |
| GET    | `/api/v1/sales/:id`                   | Sale detail with items                        | Staff  |
| DELETE | `/api/v1/sales/:id`                   | Cancel sale (reverts device statuses)         | Admin  |
| GET    | `/api/v1/bills`                       | List bills                                    | Staff  |
| POST   | `/api/v1/bills`                       | Create bill from a sale                       | Staff  |
| POST   | `/api/v1/bills/:id/issue`             | Issue (finalise) bill                         | Admin  |
| POST   | `/api/v1/bills/:id/void`              | Void bill                                     | Admin  |
| GET    | `/api/v1/bills/:id/invoice`           | Render HTML invoice                           | Staff  |
| POST   | `/api/v1/bills/:id/whatsapp`          | Send invoice via WhatsApp                     | Staff  |
| GET    | `/api/v1/customers`                   | List customers                                | Staff  |
| POST   | `/api/v1/customers`                   | Create customer                               | Staff  |
| GET    | `/api/v1/customers/:id`               | Customer detail + credit balance              | Staff  |
| GET    | `/api/v1/credit-ledger`               | Credit ledger entries                         | Staff  |
| POST   | `/api/v1/credit-ledger`               | Record payment or credit entry                | Admin  |
| GET    | `/api/v1/borrow-lends`                | List borrow/lend records                      | Staff  |
| POST   | `/api/v1/borrow-lends`                | Create borrow/lend record                     | Staff  |
| PATCH  | `/api/v1/borrow-lends/:id/return`     | Mark item as returned / settled               | Staff  |
| GET    | `/api/v1/loan-references`             | List bank EMI loan records                    | Staff  |
| POST   | `/api/v1/loan-references`             | Create loan reference                         | Staff  |
| PUT    | `/api/v1/loan-references/:id`         | Update loan reference                         | Staff  |
| PATCH  | `/api/v1/loan-references/:id/status`  | Change loan status (active/closed/overdue)    | Admin  |
| GET    | `/api/v1/expenses`                    | List expenses                                 | Staff  |
| POST   | `/api/v1/expenses`                    | Add expense                                   | Admin  |
| GET    | `/api/v1/notifications`               | List notifications (unread first)             | Staff  |
| PATCH  | `/api/v1/notifications/:id/read`      | Mark notification as read                     | Staff  |
| GET    | `/api/v1/search`                      | Global search across devices, customers, sales| Staff  |
| GET    | `/api/health`                         | Health check — no auth required               | Public |

---

## User Roles

| Role    | What they can do                                                                        |
|---------|-----------------------------------------------------------------------------------------|
| `admin` | Full access: create, edit, delete, cancel sales, issue/void bills, manage users         |
| `staff` | Read + create only — no deletions, no cancellations, no user management                 |

---

## Troubleshooting

### `make dev` fails immediately

Ensure Docker Desktop is running. Verify at least 2 GB of free RAM and that ports `80` and `27017` are not in use:

```bash
lsof -i :80
lsof -i :27017
```

### Backend exits with "failed to load config"

`backend/.env` is missing or a required variable is not set. All four required variables must be present:

```env
MONGO_URI=...
MONGO_DB=...
JWT_SECRET=...
ENCRYPTION_KEY=...
```

### Login returns 401 after seeding

The seed command prints the password **once**. If you missed it, reset the admin:

```bash
make mongo-shell
# Inside mongosh:
db.users.deleteMany({})
exit

make mongo-seed
# New password is printed — copy it
```

### Frontend shows a blank page or API errors in the console

Verify the backend is healthy:

```bash
make health
# Expected: {"status":"ok", ...}
```

If Nginx returns 502, the backend container may still be starting — wait a few seconds and refresh.

### Port 80 already in use

Edit `infra/docker-compose.yml` and change the Nginx port mapping:

```yaml
ports:
  - "8080:80"    # was "80:80"
```

Then access the app at `http://localhost:8080`.

### PWA install prompt does not appear

The service worker only activates in production builds. In dev mode (`make dev`) PWA is intentionally disabled. Build and deploy with `make prod` and access via HTTPS for the install banner to appear.

### SSL certificate fails (production)

Ensure your domain's DNS A record points to your server **before** running `init-ssl.sh`. Let's Encrypt requires HTTP-01 challenge to succeed, which means port 80 must be reachable from the internet.

### Certbot renewal fails

The `certbot` container retries every 12 hours. Check its logs:

```bash
docker compose -f infra/docker-compose.prod.yml logs certbot
```

---

## Development Notes

- **Hot-reload in Docker dev mode** — backend source is bind-mounted and Air restarts on `.go` file changes; frontend uses Vite HMR on port 5173.
- **Type safety** — `frontend/src/types/index.ts` mirrors the backend DTOs in `backend/internal/dto/`. When adding new API fields, update both files together.
- **Date format** — The backend accepts `DD-MM-YYYY` in request bodies and always responds with ISO 8601 (`2006-01-02T15:04:05Z`). The frontend's `formatDate()` utility handles ISO 8601; form inputs use the `fromApiDate()` helper to convert to `YYYY-MM-DD` for HTML date fields.
- **Swagger regeneration** — After modifying controller annotations, run `make docs` (requires the `swag` CLI: `go install github.com/swaggo/swag/cmd/swag@latest`).
- **PWA icons** — Place `pwa-192x192.png` and `pwa-512x512.png` in `frontend/public/` before the production build.
- **WhatsApp** — Set `WA_PROVIDER=noop` in `.env` to disable WhatsApp entirely (no credentials needed). Switch to `twilio` and fill in `WA_API_KEY` / `WA_FROM_NUMBER` when ready.
- **MongoDB indexes** — Indexes are created automatically on backend startup via the `EnsureIndexes()` migration in `platform/database/`.

---

## Form Validation Guide

### Customers & Vendors

| Field   | Required | Format                                              |
|---------|----------|-----------------------------------------------------|
| Name    | ✓        | Minimum 2 characters                                |
| Phone   | ✓        | E.164 international format, e.g. `+919876543210`   |
| Address | —        | Optional free text                                  |
| Notes   | —        | Optional free text                                  |

> **Phone format:** Always prefix with country code and `+`. For India: `+91` followed by 10 digits, no spaces or dashes.

### Products

| Field       | Required | Notes                                          |
|-------------|----------|------------------------------------------------|
| Brand       | ✓        | Select from existing brands                    |
| Model name  | ✓        | e.g. `Galaxy S24 Ultra`                        |
| RAM         | ✓        | Select from dropdown (2GB–32GB, or N/A)        |
| Storage     | ✓        | Select from dropdown (16GB–1TB, or N/A)        |
| Color       | ✓        | e.g. `Phantom Black`                           |
| Barcode     | ✓        | Scan or type the product barcode               |
| Screen size | —        | Optional, e.g. `6.8"`                          |
| Accessories | —        | Toggle charger / earphones / cable / box       |

### Purchases (Recording Stock In)

Each purchase records **one device** (one IMEI) per form submission:

| Field           | Required | Notes                                             |
|-----------------|----------|---------------------------------------------------|
| Vendor          | ✓        | Select from existing vendors                      |
| Product         | ✓        | Select the product model being purchased          |
| IMEI 1          | ✓        | 14–16 numeric digits — the device's primary IMEI |
| IMEI 2          | —        | Only for dual-SIM devices                         |
| Condition       | ✓        | New / Used / Refurbished                          |
| Color           | —        | Device colour (can differ from product default)   |
| Purchase price  | ✓        | Cost price in ₹                                   |
| Purchase date   | ✓        | Defaults to today                                 |

### Sales

Devices are added by scanning IMEI or picking product → available unit. Each sale can contain multiple devices. A partial payment amount can be entered; the remainder is tracked as credit balance.

### Borrow / Lends

| Field                | Required | Notes                                         |
|----------------------|----------|-----------------------------------------------|
| Type                 | ✓        | `borrow` (we got a device) or `lend` (we gave one out) |
| Device description   | ✓        | Free text — model, IMEI, colour, etc.         |
| Party name           | ✓        | Who the device was borrowed from / lent to    |
| Party phone          | —        | Contact number                                |
| Borrow date          | —        | Defaults to today                             |
| Expected return date | —        | Used for overdue alerts                       |

When closing an entry, choose a resolution: **Device returned** (physical return) or **Paid money** (kept the device, settled with cash).

### Loan References (Bank EMI)

| Field               | Required | Notes                                                    |
|---------------------|----------|----------------------------------------------------------|
| Customer            | ✓        | Select from existing customers                           |
| Finance provider    | ✓        | Bajaj / HDFC / ICICI / Axis / IDFC / TVS Credit / Other |
| Loan account number | ✓        | As printed on the EMI agreement                          |
| Loan amount (₹)     | ✓        | Total sanctioned loan amount                             |
| Linked sale         | —        | Optionally link to a completed sale                      |
| EMI amount (₹)      | —        | Monthly EMI                                              |
| Tenure (months)     | —        | e.g. 12, 24, 36                                          |
| Disbursed date      | —        | Date the loan was disbursed                              |

---

## Changelog

### Bug Fixes (latest)

**BorrowLend — Complete field-name alignment (backend + frontend)**
- Fixed critical mismatch: frontend sent `party_name` / `party_phone` / `borrow_date` (DD-MM-YYYY) but backend expected `person_name` / `person_phone` / `borrowed_at` (ISO 8601). All CRUD operations were broken.
- Fixed `resolution_type` and `settlement_amount` being silently dropped on mark-as-returned — backend `ReturnBorrowLendRequest` now includes both fields and persists them to MongoDB.
- TypeScript `BorrowLend` interface updated to remove stale fields (`device_imei`, `product_name`, `selling_price`) and reflect actual backend response fields.

**LoanReference — Feature entirely replaced (backend)**
- Old backend was a "guarantor reference person" feature (ref_name, ref_phone, relationship) — completely mismatched against the frontend which is a full bank EMI loan tracker (provider, loan_account_number, emi_amount, tenure_months).
- Backend rewritten from scratch: new model, DTO, service, and repository all aligned to bank EMI loan concept.
- Status values aligned throughout: `active | closed | overdue` (was `active | settled | defaulted`).

**Backend — API response envelope alignment**
- Fixed `TypeError: data.map is not a function` crash: list endpoints in `bill_controller.go`, `expense_controller.go`, `notification_controller.go`, `report_controller.go`, and `settings_controller.go` were wrapping paginated results in an extra object. Switched all to `response.OKWithMeta(c, items, meta)`.
- Fixed `go vet` warnings: replaced bare `== errors.ErrX` comparisons with `errors.Is()`.

**Frontend — Form validation aligned to backend DTOs**
- **Products:** Rewrote `ProductFormModal` — now sends `model_name`, `variant.ram`, `variant.storage`, `color`, `barcode` (all required). Removed non-existent fields.
- **Purchases:** Rewrote `PurchaseFormModal` — now sends per-device `items[]` with `imei1` (required, 14–16 digits), `condition`, `purchase_price`. Removed flat quantity/unit_price structure.
- **Customers & Vendors:** Phone now required with E.164 regex. Removed `email` field (not in backend DTO).
- **Type definitions:** Rewrote `Product`, `Purchase`, `PurchaseItem`, `Customer`, `Vendor` interfaces in `types/index.ts` to exactly match backend response DTOs.

---

## Developer

Developed by **CM Singh**
