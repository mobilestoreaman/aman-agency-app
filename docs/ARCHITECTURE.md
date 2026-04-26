# Aman Agency — System Architecture

## Overview

Aman Agency is a production-grade mobile store management PWA built on a
Clean Architecture foundation. It separates concerns across four distinct layers:

```
┌─────────────────────────────────────────────────────┐
│                   React PWA (Frontend)               │
│   Pages → Components → Services → Store (Zustand)   │
└────────────────────┬────────────────────────────────┘
                     │ HTTP / REST JSON
┌────────────────────▼────────────────────────────────┐
│              Go Fiber (Backend API)                  │
│  Routes → Middleware → Controller → Service →        │
│           Repository → MongoDB                       │
└─────────────────────────────────────────────────────┘
```

---

## Backend — Clean Architecture Layers

```
HTTP Request
    │
    ▼
[ Routes ]          → maps URL + method to controller handler
    │
    ▼
[ Middleware ]       → auth (JWT), RBAC, logging, rate-limit, recovery
    │
    ▼
[ Controller ]       → parse & validate request DTO, call service, return response
    │
    ▼
[ Service ]          → business logic, orchestration, domain rules
    │
    ▼
[ Repository ]       → data access abstraction (MongoDB queries)
    │
    ▼
[ MongoDB ]          → persistence
```

**Platform** packages (`platform/pdf`, `platform/whatsapp`) are injected into
services as interfaces — swappable implementations.

---

## Frontend Architecture

```
App Shell (PWA)
├── Router (React Router v6)
├── Auth Guard (JWT + Role check)
├── Layout (Sidebar + Header)
└── Pages
    ├── Dashboard
    ├── Inventory
    ├── Purchase
    ├── Sales
    ├── Customers
    ├── Credit Ledger
    ├── Loan References
    ├── Borrow / Lend
    ├── Billing
    └── Reports
```

State management: **Zustand** (lightweight, no boilerplate)
API layer: **Axios** with interceptors for auth headers
Offline: **Service Worker** via Workbox (cache-first for assets, network-first for API)

---

## Security

- JWT access tokens (15 min) + refresh tokens (7 days)
- Passwords hashed with bcrypt (cost=12)
- Role-Based Access Control (Admin / Staff)
- Helmet middleware (security headers)
- Rate limiting on auth endpoints

---

## Deployment

Single-host Docker Compose setup:

```
┌──────────────────────────────────┐
│  Nginx (reverse proxy + TLS)     │
│    /api  →  backend:3000          │
│    /     →  frontend:80          │
└──────────────────────────────────┘
        │               │
   [ Backend ]     [ Frontend ]
   Go Fiber         React PWA
        │
   [ MongoDB ]
   + persistent volume
```
