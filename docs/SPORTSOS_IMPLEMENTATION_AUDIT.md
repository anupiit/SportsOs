# SportsOS — Implementation Audit

**Date:** 2026-11-04 · **Branch audited:** `claude/serene-galileo-xn21v6` @ `77740c1` (before any change in this pass)

## How this audit was done

Every finding below was checked against the code or a live run, not taken from the existing docs:

* Read every controller, service, DTO and guard in `apps/api/src`, the Prisma schema, the single migration, the seed, the shared RBAC package and the web shell, navigation, dashboard, organisation and admin pages.
* Installed dependencies (`npm ci`), started a local PostgreSQL 16, applied migrations (`prisma migrate deploy`), validated the schema, seeded, built and started the API, then ran:
  * `npm test`: **24/24 unit tests pass** (6 suites).
  * `node apps/api/test/smoke.mjs` (end-to-end against the live API): **75/77 pass**. The two AI failures were a test-ordering artefact. The API built its index before the seed ran, and after a restart it held 31 documents.
  * `tsc --noEmit` for `apps/web`: passes.
* Reproduced each security finding marked **[reproduced]** with `curl` against the running API.

> **Earlier audit documents are inaccurate.** `docs/SPORTSOS_AUDIT_VERIFICATION.md`, `docs/SPORTSOS_TECHNICAL_AUDIT.md` and
> `docs/TECHNICAL_AUDIT.md` describe a different project state. They cite NestJS 10, Next.js 14, Prisma 5, "24 models", Passport,
> otplib, a `RolesGuard` and an `AuditInterceptor`, and a Windows path. The real code uses NestJS 11.2, Next.js 15.5, Prisma 6.19 and 17 models, and it has
> no Passport, otplib, RolesGuard or interceptor. Treat this file as the current baseline.

## Architecture (actual)

| Part | What is there |
|---|---|
| `apps/api` | NestJS 11.2, Prisma 6.19, PostgreSQL. Three global guards: `JwtAuthGuard` → `AccountThrottlerGuard` → `PermissionsGuard`. 15 feature modules. |
| `apps/web` | Next.js 15.5 App Router, Tailwind 4, SWR. 20 pages under `app/(app)`. |
| `apps/mobile` | Expo SDK 54, a separate install outside the npm workspaces. Not type-checked here because its dependencies aren't installed. |
| `packages/shared` | Roles (18), permissions (20), role→permission matrix and wire types. |
| Infra | `docker-compose.yml` (postgres, api, web). No Redis is configured or used. |
| AI | Anthropic SDK (Claude), optional. Pinecone is optional, with a local BM25 fallback. No Gemini. |
| Tests | 6 Jest unit suites (pure functions). One end-to-end smoke script (`test/smoke.mjs`). No ESLint configuration exists. |

## Module-by-module findings

Legend: ✅ working and verified · ⚠️ partial · ❌ missing or broken · 🔒 security issue

### Authentication
* ✅ bcrypt hashing (cost 10), timing-equalised login for unknown emails, JWT HS256 with a 12 h expiry, and a `JWT_SECRET` length check at boot.
* ✅ The user is reloaded from the database on every request, so deactivation takes effect immediately.
* ✅ Registration is limited to `@iitism.ac.in` addresses and always creates the role `STUDENT`, so a client can't choose its role.
* ⚠️ There is no email verification: anyone who types an `@iitism.ac.in` address can register. Fixing this needs an institutional mail service (an external dependency).
* ⚠️ The JWT lives in `localStorage`, as the README already says.

### Authorization / RBAC
* ✅ Global `PermissionsGuard` plus `@RequirePermission` on routes. Permissions come from the trusted DB role, not the token claim.
* ❌ **One role per user** (`User.role`). There are no multiple roles, scopes (club, hostel, sport, facility), validity dates, temporary roles, revocation records, approval workflow or role history.
* ❌ The permission matrix is a compile-time constant. There is no DB role-permission table, and `role.manage_permissions` is impossible.
* ❌ Permissions are coarse (20). For example, `bookings:approve` also grants cancelling anyone's booking.
* 🔒 **Peer and upward escalation:** `users:manage` (Sports Officer) can assign any non-ADMIN role, including `DEAN_SW`, `DIRECTOR` and another `SPORTS_OFFICER`, with no second approval. `users.service.ts` blocks only ADMIN.
* 🔒 **Cross-scope roster control:** in `clubs.service.ts`, `actor.role === 'SPORT_COORDINATOR'` lets *any* sport coordinator manage *any* club's roster. `attendance.service.ts` does the same when opening sessions for any club.
* 🔒 **Coach sees every user's private data:** `users:read` is granted to `COACH`. That gives them the full user directory with phone numbers, and any user's profile.
* 🔒 `complaints:manage` is granted to Ground Staff and the Equipment Manager. They can then read *every* complaint, including `STAFF` complaints, which may be about themselves.
* 🔒 `events:manage` is not scoped to the organiser, so any coordinator can add or remove teams in another person's tournament. Team add/remove is not audited.
* 🔒 `events:score` is granted to `MEDIA_NOMINEE`, so media can record official results.
* 🔒 **[reproduced] AI bypasses authorization.** `/analytics/integrity` returns 403 for a casual student, yet `POST /ai/ask` returns the same attendance-integrity and participation numbers. The knowledge index isn't filtered by the asker's permissions.
* ⚠️ Club approval mutates the global role (`STUDENT` → `CLUB_MEMBER`), so a member of club A is labelled a club member everywhere.

### Facilities
* ✅ CRUD, live status, availability grid and notifications to affected bookers. Everything is audited.
* ⚠️ Ground staff aren't scoped to an assigned facility.
* ⚠️ The seed facilities (names, coordinates, hours) are **invented placeholders**, and the seed itself says so.

### Bookings
* ✅ Create, approve, reject with a reason, and cancel. Conflict detection runs under a per-facility advisory lock, with re-checks on approval. Casual quota, opening hours, capacity, QR gate pass and gate check-in all work. Every state change is audited. Verified by smoke tests (overlap → 409, double approve → 409).
* ❌ No **rescheduling**.
* ⚠️ No notification on cancellation (to the owner when an approver cancels, or to approvers when the owner cancels).
* ⚠️ Approvers can cancel anyone's booking with no reason recorded.

### Attendance
* ✅ Rotating TOTP (RFC-tested), GPS geofence with an accuracy limit, device binding, brute-force cap, every attempt logged, unique (session, user) index. Verified end to end.
* ❌ No **attendance correction** (manual add or remove with a reason and history).
* ❌ No attendance report per team or session beyond the analytics integrity report.
* 🔒 Cross-club scope: see RBAC above.

### Inventory
* ✅ Catalogue, QR lookup, issue with a conditional decrement (no overdraw), return with damage and loss, overdue job, low-stock alerts. Audited.
* ❌ **No inventory transaction ledger.** Stock changes are recorded only in the generic audit log. Restock, issue and return don't write a stock-movement row, and there are no damage reports or stock adjustments outside a loan.
* ❌ No **equipment request / approval** workflow (club or coach requests).

### Clubs
* ✅ List, detail, create, join request, roster approval and captaincy.
* ❌ No club update or **coach reassignment**, no club **announcements**, no club activity calendar endpoint.
* 🔒 Cross-scope roster control (above).

### Tournaments
* ✅ Create, add teams, seeded single elimination with byes, round robin with standings, result entry with winner advancement, champion detection. Verified.
* ❌ No **proposal/approval** step, no team **rosters** (participants) or participant validation, no hostel-scoped registration.
* ⚠️ Team add/remove isn't audited.

### Complaints
* ✅ Submit, list own complaints, update status, assign (validated), resolution note required, notifications.
* ❌ No **attachments**, **escalation**, explicit **close/reopen**, or complaint analytics.
* 🔒 Over-broad visibility (above).

### Notifications
* ✅ Per-user inbox, unread count, mark read, role broadcast. Used across modules.

### Analytics
* ✅ All metrics are computed from the database: overview KPIs, participation, utilisation and heatmap, Holt-Winters forecast, equipment wear, attendance integrity. **No fabricated numbers in code**, though in a demo database they are computed over **synthetic seed data**.
* ❌ No complaint-resolution or booking-trend metrics.
* ⚠️ No budget or expenditure data exists anywhere in the schema, so a Dean "budget" dashboard can't be built without an institutional data source.

### SportsOS AI
* ✅ RAG with BM25 or Pinecone, Claude streaming over SSE, offline fallback, executive report, documents that hold aggregates only.
* 🔒 Not permission-aware (reproduced above).
* ❌ No AI usage tracking or logging, and no explicit request timeout.

### Audit log
* ✅ SHA-256 hash-chained, appended in the same transaction under an advisory lock, with a verify endpoint. Verified valid after activity.

### Data / seed
* 🔒 **The seed TRUNCATEs every table without a guard.** Running it against a database that holds real data would destroy that data.
* ❌ **The seed doesn't load `.env`**, so `npm run db:seed` fails in local development with "Environment variable not found: DATABASE_URL" (reproduced). The Docker path works only because env vars are injected.
* 🔒 **Invented people and realistic identifiers.** The seed creates named fake people ("Coach Ramesh Oraon", "Aditya Raj (GSec Sports)", "Vikram Tudu", "Rohit Mahto") and 60 random students whose admission numbers and `@iitism.ac.in` emails follow the real institute format, so they could collide with real students. None of these records is labelled DEMO. The README also presents official-looking mailboxes (`peso@iitism.ac.in`, `director@iitism.ac.in`) as demo logins.
* ❌ No model for institutional data sources, verification status or imports.

### Frontend
* ✅ The pages consume the real API through SWR, with loading, empty and error states, toasts and confirmations on sensitive actions. Navigation is filtered by permission.
* ⚠️ The dashboard is the same for every role except for permission-gated widgets. There is no role switcher.
* ⚠️ The organisation page shows a static matrix from the shared package and can't reflect DB changes.
* ⚠️ The user admin page has one role dropdown per user, with no scopes, validity, approvals or history.

## Required corrections (planned and tracked in `IMPLEMENTATION_CHANGELOG.md`)

1. Multi-role, scoped, time-bound role assignments with an approval workflow for privileged roles, revocation and history. A DB role-permission matrix. Granular permissions. An active-role header verified server-side.
2. Close every 🔒 item above, AI permission filtering included.
3. Bookings: rescheduling and cancellation notifications. Attendance: corrections. Inventory: transaction ledger, damage, adjustments and requests. Clubs: update, coach and announcements. Tournaments: proposal and approval, rosters with hostel validation. Complaints: attachments, escalation, close and reopen, analytics.
4. Seed safety guard and `.env` loading. DEMO labelling, with demo identities moved off the institute domain.
5. An institutional data import pipeline (CSV/XLSX, dry run, dedupe, rollback, provenance, statuses).
6. Tests for all of the above, plus RBAC tests per role.

## External blockers found during the audit

* **The official IIT (ISM) sites can't be reached from this environment.** `www.iitism.ac.in` and `people.iitism.ac.in` fail DNS resolution under the session's network policy. No institutional names, facilities or rosters could be verified, so **none have been added**. See `IIT_ISM_DATA_INTEGRATION.md`.
* There is no institutional mail service for email verification and no budget data source.
* No AI provider keys are configured. Claude and Pinecone run in offline fallback mode, so only those code paths can be exercised.
