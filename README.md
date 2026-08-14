# PharmaFind

PharmaFind is an academic pilot platform for smart medicine discovery, emergency access support, prescription workflow, deliveries, payments, and pharmacy operations around University of Ghana, Legon.

## Problem Statement

Students, staff, and surrounding residents often struggle to quickly locate required medicines, especially during emergencies. PharmaFind addresses this with searchable inventory, map-based pharmacy discovery, emergency ranking, secure prescription handling, and role-aware operations workflows.

## Implemented Features

- JWT authentication and role-based authorization (`USER`, `PHARMACIST`, `PHARMACY_ADMIN`, `DRIVER`, `SYSTEM_ADMIN`)
- Medicine search by generic, brand, category, and partial text
- Pharmacy locator with stock, open status, coordinates, and distance ranking (Haversine)
- Open-now filtering using `Africa/Accra`
- Emergency mode for required emergency medicines with emergency score ranking and disclaimer
- Prescription upload (image/PDF, MIME + extension checks, 5 MB cap), secure local storage abstraction, OCR extraction via Tesseract.js, pharmacist review status workflow
- Inventory management with constraints (`quantity >= 0`, unique pharmacy-drug), low-stock awareness, and audit events
- Delivery request lifecycle with controlled state transitions and assignment
- Driver GPS updates restricted to assigned active deliveries, stale marker flag support, audit events
- Payment initialization and verification flow with Paystack test-mode fallback and idempotent webhook handling
- SMS adapter with mock mode and persisted notification records
- Audit log API for sensitive actions

## Deferred Future Features

- FR9: Automated pharmacist licence verification
- FR12: Live pharmacy inventory synchronisation
- FR13: Telemedicine consultations

## Architecture

Monorepo:

```text
pharmafind/
  client/   # React + Vite + TypeScript + Tailwind + Leaflet
  server/   # Express + TypeScript + Prisma + PostgreSQL
  README.md
  .gitignore
  docker-compose.yml
```

## Technology Stack

- Frontend: React, Vite, TypeScript, Tailwind CSS, Leaflet + OpenStreetMap
- Backend: Node.js, Express, TypeScript, Zod
- Database: PostgreSQL with Prisma ORM
- Security: JWT, bcrypt, Helmet, CORS, auth rate limiting
- File upload/OCR: Multer + Tesseract.js
- Payments: Paystack (sandbox/test-mode fallback)
- SMS: Twilio/Hubtel-ready adapter with mock mode
- Testing: Vitest + Supertest-ready setup

## Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

### 3) Start PostgreSQL

```bash
docker compose up -d
```

### 4) Prisma migrate + seed

```bash
npm run prisma:migrate
npm run prisma:seed
```

### 5) Run app

```bash
npm run dev
```

- Client: `http://localhost:5173`
- API: `http://localhost:4000`

## Environment Variables

See:

- `server/.env.example`
- `client/.env.example`

## Test Commands

```bash
npm run test:server
npm run test:client
npm run test
```

## API Summary

Implemented route groups:

- `/api/auth/*`
- `/api/drugs/*`
- `/api/pharmacies/*`
- `/api/prescriptions/*`
- `/api/admin/*`
- `/api/inventory/*`
- `/api/deliveries/*`
- `/api/drivers/*`
- `/api/payments/*`
- `/api/notifications/*`
- `/api/audit-logs/*`

## Demonstration Credentials

Seeded users (username and email can both be used for login):

| Username | Email | Password | Role |
|----------|-------|----------|------|
| testuser | testuser@pharmafind.local | Test123! | User |
| campusadmin | campusadmin@pharmafind.local | Admin123! | Pharmacy Admin |
| pharmacist1 | pharmacist1@pharmafind.local | Pharma123! | Pharmacist |
| driver1 | driver1@pharmafind.local | Driver123! | Driver |

**Login:** Use either username or email address with the password.

## Security Controls

- Environment validation with Zod
- Helmet and CORS middleware
- Auth endpoint rate limiting
- Password hashing with bcrypt
- JWT signing and expiry
- Role checks and ownership checks on protected data
- Request validation with Zod
- Upload size/type validation
- Centralized JSON errors with request IDs
- Audit logs for sensitive actions

## Known Limitations

- OCR is image-focused and does not auto-parse PDFs
- SMS providers are adapter-ready; external provider wiring is mock-first
- Paystack live HTTP integration is scaffolded with test/mock fallback

## Deployment

- Frontend: deploy `client` on Vercel (set `VITE_API_BASE_URL`)
- Backend: deploy `server` on Render (set env vars, run Prisma migrate/seed as needed)
- Database: managed PostgreSQL provider (Render, Supabase, Neon, etc.)

## Future Roadmap

- Version 2: Live Inventory Integration
- Version 3: Pharmacist Licence Verification
- Version 4: Telemedicine Consultations
