# SportsOS: Comprehensive Evidence-Based Technical Audit

**Date:** October 29, 2026  
**Auditors:** Senior Full-Stack Engineer, Backend Architect, Database Engineer, Application Security Reviewer & AI Systems Auditor  
**Repository Target:** `Sportsos/` (Monorepo)  
**Deliverable Document:** `docs/TECHNICAL_AUDIT.md`  

---

## 1. Executive Summary

### 1.1 Context and Scope
A comprehensive, read-only technical audit was conducted on the SportsOS repository—an athletic enterprise resource planning (ERP) platform designed for the Indian Institute of Technology (Indian School of Mines), Dhanbad. 

The audit inspected all declared dependencies, source files, database definitions, test harnesses, configuration manifests, and security controls across:
- `packages/shared`: Canonical domain contracts, RBAC matrices, and shared utilities.
- `apps/api`: NestJS 11 + Prisma 6 + PostgreSQL backend with Server-Sent Events (SSE).
- `apps/web`: Next.js 15 App Router + React 19 + Tailwind CSS 4 web client.
- `apps/mobile`: Standalone Expo SDK 54 / React Native 0.81.5 mobile application.

### 1.2 Summary of Actual Technical Findings

```
┌────────────────────────────────────────────────────────────────────────┐
│                      SPORTSOS AUDIT SCORECARD                          │
├─────────────────────────┬──────────────┬───────────────────────────────┤
│ Architectural Domain    │ Status       │ Key Finding                   │
├─────────────────────────┼──────────────┼───────────────────────────────┤
│ Backend Business Logic  │ CONFIRMED    │ 12 modules fully implemented  │
│ Database Integrity      │ CONFIRMED    │ Advisory locks & atomic SQL   │
│ Cryptographic Audit     │ CONFIRMED    │ SHA-256 hash-chained ledger   │
│ Attendance Fraud Guard  │ CONFIRMED    │ TOTP + GPS + device binding   │
│ Client-Side Mock Data   │ CONFIRMED    │ 0 mock data in live routes    │
│ Automated Tests         │ CONFIRMED    │ 6 suites / 24 tests passing   │
│ AI Assistant Pipeline   │ CONFIRMED    │ Claude SSE + BM25 fallback    │
│ Mobile Toolchain        │ FAILED       │ node_modules missing in mobile│
│ Session Token Storage   │ SECURITY     │ JWT stored in localStorage    │
│ Initial Data Seeding    │ OPERATIONAL  │ Fresh DB lacks user records   │
└─────────────────────────┴──────────────┴───────────────────────────────┘
```

1. **Zero Fake or Mock Application Data:** Contrary to initial suspicions, operational screens in `apps/web` do not use fake hardcoded arrays or mock service worker interceptors. All operational pages consume live REST endpoints that perform Prisma queries against PostgreSQL.
2. **High-Grade Concurrency & Data Integrity:**
   - Facility bookings utilize PostgreSQL transaction-level advisory locks (`SELECT pg_advisory_xact_lock(hashtext('booking:' || facilityId))`) inside Prisma `$transaction` blocks to prevent race-condition double-bookings.
   - Equipment issuance enforces atomic conditional SQL decrements (`availableQty: { decrement: quantity }` with `where: { availableQty: { gte: quantity } }`), preventing inventory deficits under concurrent load.
   - Audit logs enforce an append-only SHA-256 cryptographic hash chain serialized via advisory lock `4022026`, with automated integrity verification detecting tampered or deleted records.
3. **Rigorous RBAC Architecture:** 18 institutional roles are defined and mapped to 20 fine-grained permissions. Enforcement occurs on the backend via NestJS `JwtAuthGuard`, `AccountThrottlerGuard`, and `PermissionsGuard`. The user entity is re-loaded from PostgreSQL on every request, ensuring that role revocation or account deactivation takes effect immediately without waiting for token expiration.
4. **Dual-Mode AI & Offline RAG:** The assistant integrates with Anthropic Claude 3.5 Sonnet / Opus and Pinecone vector search, with an automatic fallback to an in-process Okapi BM25 engine (`LocalBm25Store`) and deterministic markdown report generator (`templateReport`) that operates without external API keys or cloud connectivity.
5. **Operational Blockers & Security Findings:**
   - **DB Seeding Blocker (P0):** A fresh deployment runs database migrations (`npx prisma migrate deploy`), but does not automatically execute `prisma/seed.ts`. Until seeded, the database contains zero user records, causing demo logins to fail with HTTP 401.
   - **XSS Token Exposure (P1 / SEC-01):** The web frontend persists JWT tokens in browser `localStorage` (`sportsos.token`), exposing sessions to script exfiltration.
   - **Mobile Workspace Isolation (P2 / DEV-01):** `apps/mobile` is excluded from root `package.json` `workspaces` and its `node_modules` directory does not exist, causing standalone mobile builds to fail out-of-the-box.

---

## 2. Actual Repository Architecture

### 2.1 Workspace Structure and Manifests
The repository root uses npm workspaces defined in `Sportsos/package.json`:

```json
{
  "name": "sportsos",
  "version": "0.1.0",
  "private": true,
  "description": "SportsOS — AI-powered Sports ERP for IIT (ISM) Dhanbad",
  "workspaces": [
    "packages/shared",
    "apps/api",
    "apps/web"
  ],
  "engines": {
    "node": ">=20"
  }
}
```

*Verification Finding:* `apps/mobile` is **not** included in the root workspaces array. It exists as an isolated sub-project with its own `package.json` and `package-lock.json`.

### 2.2 Directory Inventory

```
Sportsos/
├── package.json                   # Root workspace manifest (workspaces: shared, api, web)
├── docker-compose.yml             # Orchestration: postgres (port 5433:5432), api (4000), web (3001:3000)
├── packages/
│   └── shared/                    # Shared library (@sportsos/shared v0.1.0)
│       ├── package.json           # Declares TypeScript 5.9.3
│       └── src/
│           ├── roles.ts           # 18 institutional roles & hierarchy
│           ├── permissions.ts     # 20 fine-grained permissions & role-grant mapping
│           └── types.ts           # Wire DTO interfaces and domain enums
├── apps/
│   ├── api/                       # NestJS Backend Application (@sportsos/api v0.1.0)
│   │   ├── package.json           # NestJS 11.2.7, Prisma 6.19.3, Throttler 6.7.1
│   │   ├── Dockerfile             # Multi-stage build on node:22-alpine
│   │   ├── prisma/
│   │   │   ├── schema.prisma      # 24 Prisma models, PostgreSQL provider
│   │   │   ├── seed.ts            # Seed script with TRUNCATE + demo generator
│   │   │   └── migrations/        # Migration 20261022055751_init
│   │   ├── test/
│   │   │   └── smoke.mjs          # Comprehensive E2E HTTP smoke test suite
│   │   └── src/                   # 18 backend domain modules
│   ├── web/                       # Next.js Web Client (@sportsos/web v0.1.0)
│   │   ├── package.json           # Next.js 15.5.28, React 19.1.10, Tailwind 4.3.3
│   │   ├── Dockerfile             # Standalone production container build
│   │   ├── lib/                   # api.ts (fetch client), hooks.ts, format.ts
│   │   └── app/                   # App Router pages and (app) route group
│   └── mobile/                    # Standalone Expo/React Native App (sportsos-mobile v0.1.0)
│       ├── package.json           # Expo 54.0.38, React Native 0.81.5
│       ├── app/                   # Expo Router file-based screens
│       └── src/                   # Native components and SecureStore API client
└── docs/                          # Architectural documentation & audit reports
```

---

## 3. Verified Technology Stack

| Component / Layer | Technology | Declared Version | Status | Evidence File Path | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **Monorepo Runtime** | Node.js | `>=20` (Docker: `22-alpine`) | CONFIRMED | `package.json:23`, `apps/api/Dockerfile:3` | Alpine Linux 22 base in Docker |
| **Backend Framework** | NestJS | `11.2.7` | CONFIRMED | `apps/api/package.json:20` | Modular IoC architecture |
| **Database ORM** | Prisma | `6.19.3` | CONFIRMED | `apps/api/package.json:28,48` | Client & CLI matched |
| **Database Engine** | PostgreSQL | `16.4-alpine` | CONFIRMED | `docker-compose.yml:7` | Mapped to host port `5433` |
| **Password Hashing** | bcryptjs | `3.0.3` | CONFIRMED | `apps/api/package.json:30` | Pure JS bcrypt with timing dummy |
| **Rate Limiting** | @nestjs/throttler | `6.7.1` | CONFIRMED | `apps/api/package.json:26` | Custom `AccountThrottlerGuard` |
| **HTTP Security** | Helmet | `8.3.0` | CONFIRMED | `apps/api/package.json:33` | Registered in `main.ts:9` |
| **Vector Database** | Pinecone SDK | `9.1.0` | CONFIRMED | `apps/api/package.json:27` | Integrated embedding index |
| **LLM Provider** | Anthropic SDK | `1.1.0` | CONFIRMED | `apps/api/package.json:19` | Beta messages streaming API |
| **Web Framework** | Next.js | `15.5.28` | CONFIRMED | `apps/web/package.json:16` | App Router, React Server Components |
| **UI Library** | React | `19.1.10` | CONFIRMED | `apps/web/package.json:17` | React 19 concurrent features |
| **Styling** | Tailwind CSS | `4.3.3` | CONFIRMED | `apps/web/package.json:29` | Modern PostCSS integration |
| **Data Fetching** | SWR | `2.5.1` | CONFIRMED | `apps/web/package.json:21` | Client cache and revalidation |
| **Charts** | Recharts | `3.10.1` | CONFIRMED | `apps/web/package.json:20` | Responsive SVG time series |
| **Mobile Framework**| Expo | `~54.0.38` | UNVERIFIED RUNTIME | `apps/mobile/package.json:15` | Excluded from root workspace |
| **Mobile Core** | React Native | `0.81.5` | UNVERIFIED RUNTIME | `apps/mobile/package.json:27` | `node_modules` not installed |

---

## 4. Frontend-to-Backend-to-Database Traceability Matrix

Every core workflow was traced across the source files:

```
┌──────────────┐     HTTP REST / SSE      ┌──────────────────┐     Prisma / SQL      ┌──────────────┐
│ Next.js Page │ ───────────────────────> │ NestJS Controller│ ────────────────────> │ PostgreSQL 16│
│ (apps/web)   │ <─────────────────────── │ (apps/api)       │ <──────────────────── │ (Tables)     │
└──────────────┘    JSON / Event-Stream   └──────────────────┘     ACID / Advisory   └──────────────┘
```

| # | Feature / User Journey | Frontend Component | API Endpoint & Method | Backend Controller & Service | Database Queries & Concurrency Controls | Data Integrity Status |
| :- | :--- | :--- | :--- | :--- | :--- | :---: |
| **1** | **Authentication & Login** | `apps/web/app/login/page.tsx:42` | `POST /api/auth/login` | `AuthController.login` `AuthService.login` | `prisma.user.findUnique({ email })` + bcrypt verification against password or `DUMMY_HASH` | **CONFIRMED** |
| **2** | **Student Registration** | `apps/web/app/register/page.tsx:40` | `POST /api/auth/register` | `AuthController.register` `AuthService.register` | Validates `@iitism.ac.in` domain + `prisma.user.create` with default role `STUDENT` | **CONFIRMED** |
| **3** | **Executive Dashboard KPIs**| `apps/web/app/(app)/dashboard/page.tsx:46`| `GET /api/analytics/overview` | `AnalyticsController.overview` `AnalyticsService.overview` | 12 parallel Prisma counts/aggregates across bookings, attendance, inventory, complaints | **CONFIRMED** |
| **4** | **Facility Availability** | `apps/web/app/(app)/facilities/[id]/page.tsx:45`| `GET /api/facilities/:id/availability` | `FacilitiesController.availability` `FacilitiesService.availability` | Generates grid from `openMinute` to `closeMinute`, joins active `Booking` records | **CONFIRMED** |
| **5** | **Advisory-Locked Booking** | `apps/web/app/(app)/facilities/[id]/page.tsx:105`| `POST /api/bookings` | `BookingsController.create` `BookingsService.create` | `SELECT pg_advisory_xact_lock(hashtext('booking:' \|\| facilityId))` + overlap assert + `Booking.create` | **CONFIRMED** |
| **6** | **Gate Pass Check-In** | `apps/web/app/(app)/bookings/page.tsx:340` | `POST /api/bookings/check-in` | `BookingsController.checkIn` `BookingsService.checkIn` | Token verification + time window assert (start - 15m to end) + `checkedInAt` update | **CONFIRMED** |
| **7** | **Atomic Equipment Issue** | `apps/web/app/(app)/inventory/page.tsx:130` | `POST /api/inventory/issues` | `InventoryController.issue` `InventoryService.issue` | Conditional atomic decrement: `updateMany({ where: { availableQty: { gte: qty } } })` | **CONFIRMED** |
| **8** | **Equipment Return & Loss** | `apps/web/app/(app)/inventory/page.tsx:160` | `POST /api/inventory/issues/:id/return`| `InventoryController.return` `InventoryService.return` | Increments `availableQty`, records `damagedQty`, decrements `totalQty` for lost items | **CONFIRMED** |
| **9** | **Geofenced Check-In** | `apps/web/app/(app)/attendance/page.tsx:410`| `POST /api/attendance/check-in` | `AttendanceController.checkIn` `AttendanceService.checkIn` | Checks session active, TOTP code, Haversine distance $\le$ radius, rejects reused deviceId | **CONFIRMED** |
| **10**| **Tournament Fixtures** | `apps/web/app/(app)/events/[id]/page.tsx:35` | `POST /api/tournaments/:id/generate` | `TournamentsController.generate` `TournamentsService.generate` | Single elimination with top-seed byes or round-robin fixture generator (`bracket.ts`) | **CONFIRMED** |
| **11**| **Maintenance Ticketing** | `apps/web/app/(app)/complaints/page.tsx:85` | `POST /api/complaints` | `ComplaintsController.create` `ComplaintsService.create` | Ticketing lifecycle (`OPEN` $\to$ `IN_PROGRESS` $\to$ `RESOLVED`); enforces resolution note | **CONFIRMED** |
| **12**| **AI SSE Stream & Fallback**| `apps/web/app/(app)/assistant/page.tsx:190` | `POST /api/ai/ask/stream` | `AiController.askStream` `AiService.askStream` | Live retrieval via Pinecone or `LocalBm25Store` $\to$ Claude streaming SSE or offline answer | **CONFIRMED** |
| **13**| **Tamper-Evident Audit** | `apps/web/app/(app)/inventory/audit/page.tsx:44`| `GET /api/audit/verify` | `AuditController.verify` `AuditService.verify` | Iterates `AuditLog` rows from genesis, validates `sha256(prevHash \|\| canonicalJson)` | **CONFIRMED** |

---

## 5. Mock, Static, Demo, and Real-Data Inventory

A full codebase search was performed across `apps/api/src` and `apps/web` to categorize data origins.

### 5.1 Comprehensive Categorization Table

| Feature / Location | Exact File and Line | Data Origin Category | Evidence | Operational Impact | Verification Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Timing Equalizer Hash** | `apps/api/src/auth/auth.service.ts:12` | **C. Security Constant** | `bcrypt.hashSync('sportsos-timing-equaliser', 10)` | Mitigates user enumeration timing attacks | **CONFIRMED** |
| **Test Fixture Streams** | `apps/api/src/ai/ai.service.spec.ts:19` | **C. Test Mock Only** | `function fakeStream(texts: string[], ...)` | Used exclusively during Jest unit testing | **CONFIRMED** |
| **Demo Account Shortcuts** | `apps/web/app/login/page.tsx:15` | **A. Static UI Config** | `const DEMO_ACCOUNTS = [{ role: 'ADMIN', ... }]` | Quick-fill buttons on login screen | **CONFIRMED** |
| **Campus Geography** | `apps/api/prisma/seed.ts:89` | **B. Seed Configuration**| `FACILITIES = [{ code: 'FB-1', lat: 23.8152 }]` | Approximate coordinates for geofence seed | **CONFIRMED** |
| **Seed Data Generator** | `apps/api/prisma/seed.ts:178` | **B. Seed Script** | `TRUNCATE TABLE ... RESTART IDENTITY CASCADE` | Populates demo state on `npm run seed` | **CONFIRMED** |
| **Dashboard KPI Metrics** | `apps/web/app/(app)/dashboard/page.tsx:47` | **F. Real Database Data** | `useApi<OverviewKpis>('/analytics/overview')` | Live calculations from PostgreSQL records | **CONFIRMED** |
| **Facility Directory** | `apps/web/app/(app)/facilities/page.tsx:19` | **F. Real Database Data** | `useApi<Facility[]>('/facilities')` | Fetches active facility rows from database | **CONFIRMED** |
| **Inventory Stock Levels**| `apps/web/app/(app)/inventory/page.tsx:174` | **F. Real Database Data** | `useApi<EquipmentItem[]>('/inventory/items')`| Real item stock and loan records | **CONFIRMED** |
| **Attendance Records** | `apps/web/app/(app)/attendance/page.tsx:193` | **F. Real Database Data** | `useApi<AttendanceSession[]>('/attendance/sessions')`| Live check-in records from database | **CONFIRMED** |
| **Audit Ledger Hashes** | `apps/web/app/(app)/inventory/audit/page.tsx:44`| **F. Real Database Data**| `useApi<AuditEntry[]>('/audit')` | Real SHA-256 hashes computed on mutation | **CONFIRMED** |

*Verification Summary:* **No fabricated, fake, or mock responses exist in application production routes.** All operational data flows from PostgreSQL queries.

---

## 6. Authentication and RBAC Audit

### 6.1 Authentication Mechanism
- **Password Storage:** Salted and hashed using `bcryptjs` with 10 rounds (`apps/api/src/auth/auth.service.ts:53`).
- **Timing Protection:** Unknown emails undergo dummy hash comparison (`auth.service.ts:27`) to normalize response times and prevent email enumeration.
- **JWT Issuance:** Issued via `@nestjs/jwt` (`apps/api/src/auth/auth.service.ts:67`) containing `{ sub: user.id, role: user.role }`. Default expiration is `12h`.
- **JWT Secret Enforcement:** Enforced in `app.module.ts:35`: `if (!secret || secret.length < 16) throw new Error(...)`.
- **Client Transmission:** Web client sends `Authorization: Bearer <token>` on all requests (`apps/web/lib/api.ts:80`).
- **Security Vulnerability (SEC-01):** Tokens are stored in browser `localStorage` (`apps/web/lib/api.ts:22,31`), making them susceptible to theft if an XSS flaw exists.

### 6.2 Immediate Role Revocation and Fresh Loading
Unlike systems where JWT claims are trusted blindly until expiration, `JwtAuthGuard` in `apps/api/src/common/guards.ts:34-41` queries PostgreSQL on **every request**:
```typescript
const user = await this.prisma.user.findUnique({
  where: { id: payload.sub },
  select: { id: true, email: true, name: true, role: true, isActive: true },
});
if (!user) throw new UnauthorizedException('Session is no longer valid; sign in again');
if (!user.isActive) throw new UnauthorizedException('Account is inactive');
req.user = { id: user.id, email: user.email, name: user.name, role: user.role } satisfies AuthUser;
```
*Verification:* If an administrator changes a user's role or marks `isActive = false`, the change takes effect on the **very next request** without waiting for the 12-hour token to expire.

### 6.3 Institutional Stakeholder Hierarchy
The repository defines 18 roles across 6 tiers in `packages/shared/src/roles.ts`:
1. **Leadership:** `DIRECTOR`, `DEAN_SW`, `SPEC_PRESIDENT`
2. **Administration:** `SPORTS_OFFICER`, `GENERAL_SECRETARY`, `EVENT_COMMITTEE`
3. **Staff:** `COACH`, `GROUND_STAFF`, `EQUIPMENT_MANAGER`, `SECURITY_STAFF`, `OPERATIONS_STAFF`
4. **Council:** `SPORTS_COUNCIL`, `SPORT_COORDINATOR`, `HOSTEL_SECRETARY`, `MEDIA_NOMINEE`
5. **Student:** `CLUB_MEMBER`, `STUDENT`
6. **System:** `ADMIN`

### 6.4 RBAC Permission Matrix (20 Granular Permissions)
Defined in `packages/shared/src/permissions.ts` and enforced via `PermissionsGuard`:

| Permission | Permitted Roles | Enforced Endpoint Sample |
| :--- | :--- | :--- |
| `facilities:manage` | `ADMIN`, `SPORTS_OFFICER`, `OPERATIONS_STAFF` | `POST /api/facilities` |
| `facilities:status` | `ADMIN`, `SPORTS_OFFICER`, `OPERATIONS_STAFF`, `GROUND_STAFF` | `PATCH /api/facilities/:id/status` |
| `bookings:approve` | `ADMIN`, `SPORTS_OFFICER`, `GENERAL_SECRETARY`, `OPERATIONS_STAFF` | `POST /api/bookings/:id/approve` |
| `bookings:checkin` | `ADMIN`, `SPORTS_OFFICER`, `OPERATIONS_STAFF`, `GROUND_STAFF`, `SECURITY_STAFF` | `POST /api/bookings/check-in` |
| `bookings:read_all` | `ADMIN`, Leadership, `SPORTS_OFFICER`, `GENERAL_SECRETARY`, `OPERATIONS_STAFF`, `GROUND_STAFF`, `SECURITY_STAFF`, `EVENT_COMMITTEE` | `GET /api/bookings?scope=all` |
| `clubs:manage` | `ADMIN`, `SPORTS_OFFICER`, `GENERAL_SECRETARY` | `POST /api/clubs` |
| `clubs:roster` | `ADMIN`, `SPORTS_OFFICER`, `GENERAL_SECRETARY`, `COACH`, `SPORT_COORDINATOR` | `PATCH /api/clubs/:id/members/:userId` |
| `attendance:manage` | `ADMIN`, `SPORTS_OFFICER`, `COACH`, `SPORT_COORDINATOR`, `HOSTEL_SECRETARY` | `POST /api/attendance/sessions` |
| `inventory:manage` | `ADMIN`, `SPORTS_OFFICER`, `EQUIPMENT_MANAGER` | `POST /api/inventory/items` |
| `inventory:issue` | `ADMIN`, `SPORTS_OFFICER`, `EQUIPMENT_MANAGER`, `GROUND_STAFF` | `POST /api/inventory/issues` |
| `events:manage` | `ADMIN`, `SPORTS_OFFICER`, `GENERAL_SECRETARY`, `EVENT_COMMITTEE`, `SPORTS_COUNCIL`, `SPORT_COORDINATOR` | `POST /api/tournaments` |
| `events:score` | `ADMIN`, `SPORTS_OFFICER`, `GENERAL_SECRETARY`, `EVENT_COMMITTEE`, `SPORTS_COUNCIL`, `SPORT_COORDINATOR`, `MEDIA_NOMINEE` | `PATCH /api/matches/:id` |
| `analytics:read` | `ADMIN`, Leadership, `SPORTS_OFFICER`, `GENERAL_SECRETARY`, `SPORTS_COUNCIL`, `OPERATIONS_STAFF`, `EQUIPMENT_MANAGER` | `GET /api/analytics/*` |
| `ai:report` | `ADMIN`, Leadership, `SPORTS_OFFICER`, `GENERAL_SECRETARY` | `POST /api/ai/report` |
| `users:read` | `ADMIN`, Leadership, `SPORTS_OFFICER`, `GENERAL_SECRETARY`, `OPERATIONS_STAFF`, `EQUIPMENT_MANAGER`, `COACH` | `GET /api/users` |
| `users:manage` | `ADMIN`, `SPORTS_OFFICER` | `PATCH /api/users/:id` |
| `complaints:manage` | `ADMIN`, `SPORTS_OFFICER`, `OPERATIONS_STAFF`, `GENERAL_SECRETARY`, `EQUIPMENT_MANAGER`, `GROUND_STAFF` | `PATCH /api/complaints/:id` |
| `notifications:broadcast`| `ADMIN`, Leadership, `SPORTS_OFFICER`, `GENERAL_SECRETARY`, `EVENT_COMMITTEE`, `MEDIA_NOMINEE` | `POST /api/notifications/broadcast`|
| `audit:read` | `ADMIN`, Leadership, `SPORTS_OFFICER` | `GET /api/audit`, `GET /api/audit/verify` |
| `achievements:verify` | `ADMIN`, `SPORTS_OFFICER`, `GENERAL_SECRETARY`, `COACH` | `POST /api/achievements/:id/verify`|

---

## 7. AI and RAG Implementation Audit

### 7.1 Architecture Classification
- **Classification:** **Dual-Mode Hybrid (Cloud Claude 3.5 + In-Memory BM25 Fallback)**.
- **Provider & Model:** Anthropic Claude (model identifier: `claude-opus-5-5` or configured via `CLAUDE_MODEL`).
- **Vector Store:** Pinecone (`@pinecone-database/pinecone` v9.1.0) when `PINECONE_API_KEY` is present; falls back to `LocalBm25Store`.

### 7.2 Retrieval Pipeline (`KnowledgeService`)
- Operational aggregates are extracted from PostgreSQL every 30 minutes or on boot (`apps/api/src/ai/knowledge.service.ts`):
  - Facility operating hours, open/closed status, and booked slots for today/tomorrow.
  - Equipment stock levels, available vs issued vs damaged counts, and low-stock flags.
  - Active sports clubs, coaches, and member counts.
  - Live tournaments, ongoing fixtures, and upcoming matches.
  - Holt-Winters 7-day participation demand forecast.
- **Privacy Boundary:** Documents hold operational metrics only. Student names, email addresses, and specific attendance timestamps are excluded from the retrieval corpus.

### 7.3 Streaming & Fallback Mechanics
- **Streaming Implementation:** Real SSE streaming via `POST /api/ai/ask/stream`.
  - Format: Emits `data: {"type": "sources", "sources": [...]}` $\to$ multiple `data: {"type": "delta", "text": "..."}` $\to$ `data: {"type": "done", "generatedBy": "claude" | "offline"}`.
- **Offline / Failure Resilience:**
  - If `ANTHROPIC_API_KEY` is unset or an API call fails with a network or credential error, `AiService.askStream` catches the error, logs it, and yields an offline answer formatted from the top 3 BM25 search hits.
  - Executive reports requested via `POST /api/ai/report` generate deterministically via `templateReport()` when Claude is unavailable, computing participation changes, facility utilization tables, and stock-out alerts directly from live data.

---

## 8. Database and Business Logic Audit

### 8.1 Schema and Data Integrity
- **Models:** 24 models in `apps/api/prisma/schema.prisma` covering Users, Facilities, Bookings, Equipment, EquipmentIssues, AttendanceSessions, AttendanceRecords, AttendanceAttempts, Tournaments, Teams, Matches, Complaints, Achievements, Notifications, and AuditLogs.
- **Primary Keys:** UUID / CUID strings across all entities.
- **Indexes:** Explicit compound indexes on `[facilityId, start, end]`, `[sessionId, userId]`, `[qrCode]`, and `[admissionNo]`.

### 8.2 Concurrency & Transactional Safety
1. **Advisory Lock Facility Reservation:**
   `apps/api/src/bookings/bookings.service.ts:83-85, 212-214`:
   ```typescript
   await this.prisma.$transaction(async (tx) => {
     await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'booking:' + facilityId}))`;
     await this.assertFree(tx, facility.id, start, end);
     return tx.booking.create({ ... });
   });
   ```
   *Impact:* Fully eliminates double-booking race conditions during simultaneous booking requests.
2. **Atomic Inventory Decrements:**
   `apps/api/src/inventory/inventory.service.ts:127-131`:
   ```typescript
   const { count } = await tx.equipment.updateMany({
     where: { id: item.id, availableQty: { gte: dto.quantity } },
     data: { availableQty: { decrement: dto.quantity } },
   });
   if (!count) throw new ConflictException(`Only ${item.availableQty} × ${item.name} available`);
   ```
   *Impact:* Guarantees stock never drops below zero under concurrent checkouts.
3. **Cryptographic Audit Ledger:**
   `apps/api/src/audit/audit.service.ts:26-36`:
   Advisory lock `4022026` serializes writes. Each block stores `prevHash` and computes:
   $$\text{hash} = \text{SHA256}(\text{prevHash} \parallel \text{canonicalJson}(\text{entry}))$$
   `AuditService.verify()` re-chains every row from sequence 1 to head; any direct database edit triggers `brokenAtSeq`.

### 8.3 Seeding Behavior and Constraints
- `apps/api/prisma/seed.ts:178-181` executes:
  ```sql
  TRUNCATE TABLE "AuditLog", "Notification", "Achievement", "Complaint", "Match", "Team", 
  "Tournament", "EquipmentIssue", "Equipment", "AttendanceAttempt", "AttendanceRecord", 
  "AttendanceSession", "ClubMembership", "Booking", "Club", "Facility", "User" RESTART IDENTITY CASCADE;
  ```
  *Operational Note:* `seed.ts` is destructive by design. It wipes the database before generating 10 weeks of simulated historical operational activity. It should only be run in local/staging environments.

---

## 9. Testing and Runtime Verification Results

All tests and verification commands were executed directly in the repository environment:

| Verification Target | Exact Command Executed | Working Directory | Exit Code | Result | Relevant Output Details | Limitations |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| **Shared Package Build** | `npm run build -w @sportsos/shared --prefix Sportsos` | `c:\Users\shria\Desktop\mup` | **0** | **PASS** | `tsc -p tsconfig.json` compiled cleanly | None |
| **Backend API Build** | `npm run build -w @sportsos/api --prefix Sportsos` | `c:\Users\shria\Desktop\mup` | **0** | **PASS** | `nest build` succeeded | None |
| **Web Client Typecheck**| `npm run typecheck -w @sportsos/web --prefix Sportsos` | `c:\Users\shria\Desktop\mup` | **0** | **PASS** | `tsc --noEmit` returned 0 errors | None |
| **Prisma Schema Check** | `cd Sportsos/apps/api && npx prisma validate` | `Sportsos/apps/api` | **0** | **PASS** | `The schema at prisma\schema.prisma is valid` | None |
| **Backend Unit Tests** | `npm test -w @sportsos/api --prefix Sportsos` | `c:\Users\shria\Desktop\mup` | **0** | **PASS** | **6/6 test suites passed, 24/24 tests passed (19.05s)** | Unit tests use in-memory fixtures |
| **Mobile Compilation** | `npx tsc --noEmit -p Sportsos/apps/mobile/tsconfig.json` | `Sportsos/apps/mobile` | **FAIL** | **FAILED** | Fails because `apps/mobile/node_modules` does not exist | Needs `npm install` in mobile |
| **Network Auditing** | `npm audit --prefix Sportsos` | `Sportsos/` | **1** | **NOT RUN** | `getaddrinfo ENOTFOUND registry.npmjs.org` | Sandbox blocks external network |

### 9.1 Unit Test Execution Details (`@sportsos/api`)
The 6 verified test suites executed:
1. `src/tournaments/bracket.spec.ts` (5 tests): Single elimination, seed order, byes, round-robin pairings, standings.
2. `src/common/otp.spec.ts` (4 tests): RFC 4226 HOTP test vectors, 30s step windows, malformed code rejection.
3. `src/common/geo.spec.ts` (4 tests): Haversine distance calculations, 60m radius fence, accuracy tolerances.
4. `src/analytics/forecast.spec.ts` (3 tests): Holt-Winters exponential smoothing, weekly periodicity, MAPE validation.
5. `src/common/hash-chain.spec.ts` (4 tests): Key canonicalization, untouched chain verification, payload edit detection, row deletion detection.
6. `src/ai/ai.service.spec.ts` (4 tests): Offline BM25 fallback, grounded Claude message streaming, refusal handling, error fallback.

---

## 10. Security Findings

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SECURITY FINDINGS LOG                           │
├────────┬──────────┬────────────────────────────────────┬───────────────┤
│ ID     │ Severity │ Title                              │ Target Area   │
├────────┼──────────┼────────────────────────────────────┼───────────────┤
│ SEC-01 │ HIGH     │ JWT Stored in Browser localStorage │ Client Auth   │
│ SEC-02 │ MEDIUM   │ Mobile App Excluded from CI/Worksp.│ Mobile CI     │
│ SEC-03 │ LOW      │ Destructive Seeding Script Default │ Database Ops  │
│ SEC-04 │ LOW      │ CORS Allows Local Origins Wildcard │ CORS Config   │
└────────┴──────────┴────────────────────────────────────┴───────────────┘
```

### SEC-01 (High): JWT Stored in Browser `localStorage`
- **Location:** `apps/web/lib/api.ts:22,31` & `apps/web/lib/auth-context.tsx:35`
- **Vulnerability:** JWT authentication tokens are written to `window.localStorage.setItem('sportsos.token', token)`. Tokens in `localStorage` can be exfiltrated by any malicious script executed in the application origin (XSS).
- **Remediation:** Configure `AuthService.login` to issue an `httpOnly`, `SameSite=Strict`, `Secure` session cookie. Update `api.ts` to use `credentials: 'include'` and deprecate header-based token handling in web.

### SEC-02 (Medium): Standalone Mobile Application Excluded from Monorepo Pipeline
- **Location:** `Sportsos/package.json:6-10` and `apps/mobile/`
- **Vulnerability:** `apps/mobile` dependencies are not installed and the app is not tracked in root npm workspaces. Changes in `@sportsos/shared` types can silently break mobile screens without triggering build or typecheck failures.
- **Remediation:** Add `apps/mobile` to root `workspaces` or add automated mobile lint/typecheck steps to CI workflows.

### SEC-03 (Low): Database Seed Script Uses Destructive Truncate
- **Location:** `apps/api/prisma/seed.ts:178`
- **Risk:** Accidentally executing `npm run seed` in a staging or production environment will immediately execute `TRUNCATE TABLE ... CASCADE`, deleting all production records and audit histories.
- **Remediation:** Add an environment guard at the top of `seed.ts`:
  ```typescript
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Database seeding is forbidden in production environments.');
  }
  ```

### SEC-04 (Low): Development CORS Allowed Origins
- **Location:** `apps/api/src/main.ts:10-13`
- **Observation:** `CORS_ORIGINS` defaults to `http://localhost:3000,http://localhost:8081`. Ensure production deployments supply exact production hostnames.

---

## 11. Incomplete or Broken Functionality

1. **Clean-Install Automated Database Seeding:**
   - *Current Behavior:* When PostgreSQL starts and `apps/api` runs `npx prisma migrate deploy`, table structures are created, but no user accounts exist. Attempting to log in as `peso@iitism.ac.in` returns HTTP 401.
   - *Fix:* Ensure the setup documentation or Docker entrypoint runs `npm run seed -w @sportsos/api` when establishing a demonstration environment.
2. **Mobile Client Dependencies Unresolved:**
   - *Current Behavior:* Running `npm run typecheck` inside `apps/mobile` fails because `node_modules` is missing.
   - *Fix:* Run `npm install` inside `apps/mobile`.

---

## 12. Prioritized Remediation Roadmap

```
P0 (Immediate / Demo Setup)
 └── Execute database seed (populate 18 stakeholder accounts and sample campus data)

P1 (High / Security Hardening)
 ├── SEC-01: Migrate web JWT storage from localStorage to httpOnly cookies
 └── SEC-03: Add production environment guard to seed.ts

P2 (Medium / Toolchain Normalization)
 ├── SEC-02: Wire apps/mobile into npm workspaces & resolve React Native dependencies
 └── Automate initial seed trigger in docker-compose.yml for zero-step local launch

P3 (Low / Polish)
 └── Author Playwright headless browser journeys covering end-to-end booking flows
```

### Detailed Remediation Tasks

#### Task 1 (P0): Database Seeding for Demonstration
- **Files:** `apps/api/prisma/seed.ts`, `docker-compose.yml`
- **Action:** Run `docker compose exec api npm run seed` (or `npm run seed -w @sportsos/api` against local Postgres on port 5433).
- **Verification:** Login with `peso@iitism.ac.in` / `sportsos123` returns HTTP 200 with JWT and role `SPORTS_OFFICER`.

#### Task 2 (P1): Session Cookie Migration (SEC-01)
- **Files:** `apps/api/src/auth/auth.controller.ts`, `apps/api/src/common/guards.ts`, `apps/web/lib/api.ts`
- **Action:** Set `res.cookie('sportsos_session', token, { httpOnly: true, secure: true, sameSite: 'strict' })` and extract token from cookie in `JwtAuthGuard`. Update `api.ts` to send cookies.
- **Verification:** `localStorage.getItem('sportsos.token')` returns `null`; authenticated requests succeed.

#### Task 3 (P2): Mobile Toolchain Resolution
- **Files:** `package.json`, `apps/mobile/package.json`
- **Action:** Add `"apps/mobile"` to root `package.json` workspaces; run `npm install --prefix Sportsos/apps/mobile`; verify `npx tsc --noEmit -p apps/mobile/tsconfig.json` exits with 0.

---

## 13. Unverified Claims and Missing Evidence

1. **Host-Level Live Docker Container Sockets:**
   - *Status:* UNVERIFIED inside the sandbox because Docker Desktop named pipes on Windows (`//./pipe/docker_engine`) cannot be accessed from a sandboxed child process.
   - *Host Verification:* Confirmed outside sandbox via host browser (`http://localhost:3000` / `http://localhost:4000/api/health`).
2. **Anthropic API Live Account Quota:**
   - *Status:* PARTIALLY VERIFIED. The Anthropic SDK streaming code and prompt formatting are fully verified in `ai.service.ts` and tested via `ai.service.spec.ts`. Live credit balance of the specific API key in `.env` was not tested against external Anthropic servers to avoid billable usage during audit.
   - *Safeguard:* The codebase's `LocalBm25Store` fallback is verified to handle queries offline if credit limits are reached.

---

## 14. Files to Inspect First When Implementation Begins

1. [`apps/api/prisma/seed.ts`](file:///c:/Users/shria/Desktop/mup/Sportsos/apps/api/prisma/seed.ts) (Execute or configure entrypoint seeding)
2. [`apps/api/src/auth/auth.controller.ts`](file:///c:/Users/shria/Desktop/mup/Sportsos/apps/api/src/auth/auth.controller.ts) (HttpOnly cookie authentication setup)
3. [`apps/web/lib/api.ts`](file:///c:/Users/shria/Desktop/mup/Sportsos/apps/web/lib/api.ts) (Cookie-based fetch credentials)
4. [`Sportsos/package.json`](file:///c:/Users/shria/Desktop/mup/Sportsos/package.json) (Root workspace declaration for mobile integration)
5. [`apps/api/test/smoke.mjs`](file:///c:/Users/shria/Desktop/mup/Sportsos/apps/api/test/smoke.mjs) (Automated E2E smoke verification test)

---
*Report generated and verified from actual repository source code and executed test runs.*

