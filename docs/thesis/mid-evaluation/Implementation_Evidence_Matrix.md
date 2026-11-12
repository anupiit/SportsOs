# SportsOS — Module-Wise Implementation Evidence Matrix

Mid-evaluation, 13 November 2026 · Anup Kumar (22JE0143)

Every status below rests on evidence from the repository at commit `642af86`, gathered on **12 November 2026**. Each test
was re-run in that session against a freshly migrated and seeded PostgreSQL 16 database, using the production builds of
the API and web client. The raw logs are in [`evidence/`](evidence/).

**Status labels**

- **Implemented, tested** — the code exists end to end, and an automated or scripted check passed on 12 Nov 2026.
- **Partial** — the feature is implemented, but a significant part is unverified or missing.
- **Configured** — configuration files exist, but nothing was executed.
- **Not implemented** — no code exists.
- **Planned** — the item is on the roadmap.

## 1. Modules

| Module | Backend (apps/api/src) | Web (apps/web) | Mobile (apps/mobile) | DB models | Verification evidence (12 Nov 2026) | Status |
|---|---|---|---|---|---|---|
| Authentication | `auth/auth.service.ts`, `auth.controller.ts`, `common/guards.ts` | `app/login`, `app/register`, `lib/api.ts` | `app/login.tsx`, `src/auth.tsx` (SecureStore) | User | 19/19 demo logins (`verify.log`); smoke: unknown → 401, no token → 401, hash never returned, domain-restricted register; e2e: tampered JWT → 401, deactivated token rejected | Implemented, tested |
| Forgot / reset password | — | — | — | — | `POST /api/auth/forgot-password` → 404, `/reset-password` → 404 (`verify.log`) | **Not implemented** |
| RBAC | `rbac/access.ts`, `rbac.service.ts`, `role-assignments.service.ts` | `admin/roles`, `organisation`, role switcher in `components/shell` | — | RoleAssignment, RolePermission, PermissionDefinition | Unit 32/32 (`access.spec.ts`); e2e 23 endpoints × 18 roles, spoofing, scope isolation, assignment safeguards (`e2e.log`); UI 9/9 roles (`uiroles.log`) | Implemented, tested |
| Coach assigned-club scope | `access.ts` (`COACH_CLUB_SCOPED`, `coachedClubIds`) | `attendance`, `clubs` | — | Club.coachId | ATT-01 201 / ATT-02 403 / ATT-03 403 (`attn.log`); e2e cross-club cases. Seed has coaches for 2 of 5 clubs only | Implemented, tested |
| Users | `users/*` | `admin/users`, `users/[id]`, `directory` | `app/(tabs)/profile.tsx` | User | smoke: roles not settable via PATCH /users; e2e: student cannot create/deactivate; directory hides phones | Implemented, tested |
| Facilities | `facilities/*` | `facilities`, `facilities/[id]` | `app/book/*` | Facility | smoke: list + availability grid; e2e: scoped ground staff | Implemented, tested |
| Bookings + QR gate pass | `bookings/*`, `common/qr.ts` | `bookings`, `components/bookings.tsx` | `(tabs)/bookings.tsx`, `booking/[id]`, `pass/[token]` | Booking | smoke: auto-approve, overlap 409, hours 400, gate pass, early check-in 409, approvals; e2e: 6 concurrent → 1 winner | Implemented, tested |
| Clubs | `clubs/*` | `clubs`, `clubs/[id]` | — | Club, ClubMembership | smoke: clubs listed, broadcast; e2e: roster scope, announcements | Implemented, tested |
| Verified attendance | `attendance/*`, `common/otp.ts`, `common/geo.ts` | `attendance`, `components/attendance/projector.tsx` | `(tabs)/checkin.tsx` (expo-location), `src/device.ts` | AttendanceSession/Record/Attempt/Correction | Unit: RFC 4226 vectors, geofence; ATT-01…11 (`attn.log`); smoke: DEVICE_REUSED; e2e: manual corrections (no fabricated GPS) | Implemented, tested (API/web); mobile path untested |
| Inventory + ledger + QR | `inventory/*` (`applyStock`) | `inventory`, `inventory/audit`, `components/inventory*.tsx` | `(tabs)/scan.tsx` (expo-camera), `equipment/[code]` | Equipment, EquipmentIssue, InventoryTransaction, EquipmentRequest | smoke: issue via QR, over-issue 409, damaged return; e2e: 8 concurrent on 3 → 3, ledger reconciles, requests | Implemented, tested |
| Tournaments | `tournaments/*`, `bracket.ts` | `events`, `events/[id]` | — | Tournament, Team, TeamMember, Match | Unit 5/5; smoke: proposal → approval → bracket → champion, round robin; e2e: hostel-scoped registration | Implemented, tested |
| Complaints | `complaints/*` | `complaints` | — | Complaint, ComplaintAttachment | smoke: raise/resolve; e2e: 16 lifecycle and visibility checks incl. content sniffing | Implemented, tested |
| Notifications | `notifications/*` | `notifications`, bell (30 s polling) | — | Notification | smoke: unread, broadcast | Implemented, tested (polling only; no push) |
| Announcements | `announcements/announcements.module.ts` | `announcements` | — | Announcement | e2e: draft → approve → publish; author cannot approve | Implemented, tested |
| Operational tasks | `tasks/tasks.module.ts` | `tasks` | — | OperationalTask | e2e: assign, assignee-only update | Implemented, tested |
| Analytics + forecast | `analytics/*`, `forecast.ts` | `analytics`, `components/charts` | — | (reads all) | smoke: 6 analytics endpoints; unit 3/3 forecast | Implemented, tested (**synthetic data only**) |
| Audit ledger | `audit/*`, `common/hash-chain.ts` | `inventory/audit` | — | AuditLog | Unit 4/4; `/audit/verify` valid, 589 entries (`verify` run) | Implemented, tested |
| Institutional import | `institution/*` | `admin/institution`, `directory` | — | InstitutionalRecord, ImportBatch, ImportBatchItem | Unit 11/11; e2e 14 (preview, commit, rollback) | Implemented, tested |
| Scheduled jobs | `jobs/jobs.service.ts` | — | — | — | Not tested directly (alerts observed in smoke) | Implemented; timing untested |
| AI assistant / reports | `ai/ai.service.ts`, `knowledge.service.ts`, `vector-store.ts` | `assistant`, `lib/speech.ts` | — | AiUsageLog | `/ai/status` = offline/local; smoke: offline RAG, SSE, report; e2e: permission isolation; unit 8/8 (LLM **mocked**) | **Partial** — live Claude/Pinecone and voice untested |
| Mobile app | — | — | 11 screens + 2 layouts under `app/` | — | `npx tsc --noEmit` exit 0 | **Partial** — not run on device/simulator |
| Redis | — | — | — | — | No dependency or code references | **Not implemented** |
| Docker deployment | `apps/api/Dockerfile` | `apps/web/Dockerfile` | — | — | Docker daemon unavailable; components run natively instead | **Configured** |
| Cloud (AWS / Vercel) | — | — | — | — | — | **Planned** |

## 2. Previously identified issues: recheck results

| Issue | Finding on 12 Nov 2026 | Evidence |
|---|---|---|
| Duplicate API processes on port 4000 | Not reproduced. One process ran; a second instance exited at once with `EADDRINUSE: address already in use 0.0.0.0:4000` (exit 1). Most likely a stale dev watcher. | Session run |
| Demo authentication failures | Not reproduced: 19/19 accounts signed in after migrate + seed. The changelog records that the seed previously did not load `.env`, so seeding failed and the accounts never existed. | `verify.log` |
| Seed data consistency | Seed ran cleanly twice (identical counts: 79 users, 9 facilities, 5 clubs, 2,798 bookings, 120 sessions, 1,080 check-ins, 283 loans, 3 tournaments, 588 audit entries). The audit chain was valid. Only Football and Basketball clubs have a coach assigned. | Seed output, `/audit/verify` |
| RBAC validation | 200/200 e2e checks and 32/32 unit tests passed. | `e2e.log`, `unit.log` |
| Coach assigned-club access | Enforced: own club 201, other club 403, other coach's OTP 403. | `attn.log` |
| Forgot-password | Not implemented (404). | `verify.log` |
| Redis integration | Not present; rate-limit and matrix cache are in-process. | `package.json`, grep |
| AI integration | Offline path works; live LLM/vector paths untested (no keys). | `smoke.log`, `/ai/status` |

## 3. Additional findings

- **D-01 (cosmetic):** the attendance duration picker shows "1.5 hours 30 min" for 90 minutes, because
  `apps/web/app/(app)/attendance/page.tsx:139` uses `m / 60` without `Math.floor`.
- **Dependency audit:** `npm audit --omit=dev` reports 10 advisories (7 high, 3 moderate) in `body-parser`,
  `multer`, `deepmerge-ts`, the PostCSS bundled with Next.js, and `uuid`. These have not been triaged yet.
- **ESLint:** 0 errors and 2 warnings: one `no-explicit-any` in the API, and one `react-hooks/exhaustive-deps` in
  `attendance/page.tsx`.
- **Security headers:** confirmed CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, COOP/CORP. The CORS
  allow-list sends no `Access-Control-Allow-Origin` to unknown origins.
