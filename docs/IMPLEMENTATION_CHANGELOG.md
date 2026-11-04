# SportsOS — Implementation Changelog & Final Report

Branch `claude/serene-galileo-xn21v6`, built on `77740c1`. The existing architecture (NestJS + Prisma + PostgreSQL,
Next.js, Expo, shared package) is unchanged. Nothing working was removed. Where a default permission changed, it is
listed under "Behaviour changes" and can be restored from the live matrix.

## 1. What was already working (verified, not assumed)

Bcrypt auth with timing equalisation; JWT with the user reloaded per request; global permission guard; advisory-locked
conflict-free booking; RFC-tested rotating OTP + GPS geofence + device binding for attendance; conditional stock
decrement; SHA-256 hash-chained audit ledger; seeded brackets and round robin; Holt-Winters forecast; database-driven
analytics; RAG assistant with offline fallback; and web pages wired to real APIs with loading, empty and error states.
Baseline: 24/24 unit tests and 75/77 smoke checks (the 2 failures were a test-ordering artefact). Details are in
`SPORTSOS_IMPLEMENTATION_AUDIT.md`.

## 2. What was broken or unsafe, and what was done

| Problem (baseline) | Fix |
|---|---|
| One role per user; no scopes, validity, approval, revocation or history | `RoleAssignment` with scopes, validity, a status workflow and history; two-person approval for privileged roles; expiry job |
| Compile-time matrix; 20 coarse permissions | 70 granular permissions; DB-backed `RolePermission` matrix with an editor, lock-out protection and audit |
| **Escalation:** the Sports Officer could make anyone Dean, Director or Sports Officer | Approval workflow, plus a "can't grant sensitive powers you lack" rule; ADMIN only by ADMIN; last-admin protection |
| **Cross-scope:** any sport coordinator could manage any club's roster and open sessions for it | Scoped `SPORT_COORDINATOR` (sport) and coach (coached clubs) checks in clubs, attendance and bookings |
| **Privacy:** coaches could list every user with phone numbers | Coaches lost `user.view` and see only their own players; the directory hides phones without `user.update` |
| **Privacy:** ground staff and the equipment manager could read every complaint, including STAFF ones | Handlers see only complaints assigned to them; managers see all; leadership sees escalated ones |
| **AI bypassed authorization** (reproduced: a student got the integrity analytics via `/ai/ask`) | Permission-tagged documents, filtered before the model sees them; deny by default for unknown documents |
| Media nominee could record official match results | `event.record_results` is Event Committee / PESO only |
| Any `events:manage` holder could edit anyone's tournament teams; not audited | Proposal and approval workflow; hostel-scoped registration; team changes audited |
| Seed `TRUNCATE`d everything with no guard; didn't load `.env` (so `npm run db:seed` failed locally) | Guarded (non-demo data blocks it; production blocked); loads `.env` |
| Seed invented named people and realistic `@iitism.ac.in` identities, with no DEMO label | All seeded data is `isDemo` with `[DEMO]` names, `@sportsos.demo`, `ZZ` admission numbers and `Hostel A–I` |
| Old audit documents contained false claims | Superseded banners; a new verified audit |

## 3. What was implemented

**Authorization (`apps/api/src/rbac`, `common/guards.ts`).** Per-request principal resolution from the DB; `X-Active-Role`
verified server-side; `@RequirePermission` and `@RequireAnyPermission`; pure, unit-tested scope helpers (`canIn`,
`permissionScope`); notifications targeted by permission. Admin bootstrap script for real deployments.

**Modules.**
* Bookings: reschedule, self-approval ban, cancel reason and notification, scoped schedules, entry log.
* Attendance: manual corrections (no fabricated GPS) with history; team attendance report.
* Inventory: `InventoryTransaction` ledger for every stock change (initial, restock, issue, return, damage, repair, loss,
  write-off, adjustment); equipment requests (request → approve → fulfil).
* Clubs: update and coach reassignment, announcements, calendar, leave; CLUB_MEMBER role synced with membership.
* Tournaments: proposals and approval, hostel-scoped registration, rosters with residency and uniqueness checks,
  leaderboard.
* Complaints: escalation, close and reopen rules, content-sniffed attachments (≤ 2 MB), analytics.
* New: official announcements workflow (draft → submit → approve → publish); operational tasks for staff.
* Analytics: complaint resolution, booking trends, CSV export (formula-injection-safe).
* AI: permission-aware retrieval, usage metadata log, timeout and retries, stricter "don't invent" prompt.

**Institutional data.** `InstitutionalRecord`, `ImportBatch` and `ImportBatchItem`; CSV and XLSX import with dry run,
normalisation, in-file and DB duplicate detection, provenance, data statuses, conflict-checked commit and rollback, a
nightly expiry job, a public Directory of VERIFIED records only.

**Web.** Role switcher; permission-driven nav and quick actions (no dead buttons); per-permission dashboard work queues
using live data; an honest "no finance data source" card instead of budget numbers; new pages for Roles & permissions,
Institutional data, Directory, Announcements and Tasks; Users page with a roles drawer; reschedule, complaint actions and
attachments, tournament review and rosters, inventory requests, ledger and movements, club announcements, attendance
corrections; organisation chart reads the live matrix; DEMO badges; the demo login panel can be hidden.

**Mobile.** New permission names; manual-attendance display; demo identities.

**Tooling.** ESLint for API and web (none existed before); root `lint`, `typecheck`, `test:smoke`, `test:e2e` scripts;
RBAC e2e suite; Playwright UI scripts.

## 4. Behaviour changes to review

The new defaults follow the role descriptions in the brief. An administrator can restore any of these in
`Roles & permissions`.

* The **General Secretary** and **Operations Staff** no longer approve bookings. Approval sits with the Sports Officer.
* **Ground Staff** no longer issue equipment; **Equipment Manager** and the **Coach** lost `users:read`.
* The **System Administrator** is no longer an operational super-user: no booking approval, stock issue or event
  approval. They manage users, roles, permissions, imports and audit.
* **Hostel Sports Secretaries** no longer open attendance sessions. They register their hostel's teams.
* Tournaments created by anyone without `event.approve` (Event Committee, GSec, Council, coordinators, hostel
  secretaries) start as **proposals**.
* `PATCH /users/:id` no longer accepts `role`; use `/rbac/assignments`.
* Demo logins changed from `…@iitism.ac.in` to `…@sportsos.demo`.
* The backend commit message mentions an "84-check smoke"; the correct count is 83 (the 84th line was the summary).

## 5. Data: verified vs. needing authorisation

* **Genuinely verified institutional data in this build: none.** The official IIT (ISM) sites were unreachable from the
  build environment, and nothing was entered from memory.
* **Needs authorisation or access:** network access to `www.iitism.ac.in` and `people.iitism.ac.in` (personnel,
  facilities, sports); an authorised current roster of student office-bearers; surveyed facility coordinates and hours;
  the official hostel list; any finance data. See `IIT_ISM_DATA_INTEGRATION.md`.

## 6. API keys

None required. Optional: `ANTHROPIC_API_KEY` (Claude answers and reports) and `PINECONE_API_KEY` (managed vector
index). Without them the assistant runs in offline retrieval mode. Gemini is not implemented or needed.

## 7. Feature status

| Area | Status |
|---|---|
| RBAC: multi-role, scopes, temporary roles, approval, revocation, history, DB matrix, active role, audit | ✅ functional; API + UI; e2e-tested for all 18 roles |
| Bookings, attendance, inventory, clubs, tournaments, complaints, notifications, analytics | ✅ functional end to end (API + UI + tests) |
| Announcements workflow, operational tasks | ✅ functional (API + UI + tests) |
| Institutional import (CSV/XLSX, preview, commit, rollback, statuses) and Directory | ✅ functional; **no real data loaded** |
| Permission-aware AI | ✅ functional offline; Claude path covered by mocked tests only (no key) |
| Role dashboards | ✅ work queues per permission. ⚠️ Budget/expenditure deliberately shows "no data source" |
| Security entry/**exit** logging | ⚠️ Entry (gate check-in) only. There is no exit event in the model |
| Equipment purchase requests | ⚠️ Covered by equipment requests for items not in the catalogue; there is no procurement or finance workflow |
| Event photography / media uploads | ⚠️ Not implemented: no media storage service. Announcements are text only |
| Complaint AI categorisation | ⚠️ Not implemented as a separate feature; the category is chosen by the user |
| Email verification / SSO; httpOnly-cookie sessions | ❌ Not implemented (needs institutional mail/SSO; JWT stays in `localStorage`, as documented before) |
| Mobile app at runtime | ⚠️ Type-checked against the new API, not run on a device |

## 8. Test results

Typecheck ✅ · lint ✅ (0 errors) · Prisma ✅ · unit **71/71** · smoke **83/83** · RBAC e2e **200/200** · browser
**9/9 + 12/12** · production build ✅ · migration on both a populated and an empty DB ✅. Full details in `TEST_REPORT.md`.

## 9. Deployment

See `ENVIRONMENT_SETUP.md`: `npm ci && npm run build`; `prisma migrate deploy` (never `reset`); bootstrap the first
administrator with `npm run bootstrap:admin -w @sportsos/api`; **don't run the demo seed in production**; build the web
app with `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=false`; import institutional data from authorised sources.
