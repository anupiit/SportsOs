# SportsOS — Test Report

**Run date:** 2026-11-04 · **Environment:** Linux container, Node 22.23, PostgreSQL 16 (local), Chromium (Playwright) ·
**Database:** freshly seeded DEMO data (`SEED_FORCE_RESET=true npm run seed`) · **AI:** no API keys, so the offline
retrieval path was tested; the Claude path is covered by mocked unit tests only.

Every result below comes from an actual run in this environment. Nothing is extrapolated.

## Summary

| Check | Command | Result |
|---|---|---|
| TypeScript: shared, API, web | `npm run typecheck` | ✅ exit 0 |
| TypeScript: mobile (separate install) | `cd apps/mobile && npx tsc --noEmit` | ✅ exit 0 |
| ESLint: API and web | `npm run lint` | ✅ 0 errors, 2 warnings (both `react-hooks/exhaustive-deps` / `no-explicit-any` in code that predates this work) |
| Prisma | `prisma validate`, `prisma migrate status` | ✅ valid, up to date |
| Migration on an existing populated DB | `prisma migrate dev` on the seeded baseline | ✅ applied; backfill counts verified |
| Migration on an empty DB | `prisma migrate deploy` → bootstrap admin → login → `/audit/verify` | ✅ 2 migrations applied, 70 permissions and 346 default grants registered on boot, chain valid |
| Unit tests | `npm test` | ✅ **71 / 71** in 8 suites (baseline before this work: 24 / 24 in 6 suites) |
| API smoke (end to end) | `npm run test:smoke` | ✅ **83 / 83** (baseline: 75 / 77, with both failures a test-ordering artefact) |
| RBAC and workflow e2e | `npm run test:e2e` | ✅ **200 / 200** |
| Browser: per-role UI | `node apps/web/test/ui-roles.e2e.cjs` | ✅ **9 / 9** roles, with nav as expected and zero console errors or failed API calls |
| Browser: interactive flows | `node apps/web/test/ui-flows.e2e.cjs` | ✅ **12 / 12** |
| Production build: shared, API, web | `npm run build` | ✅ exit 0 (26 web routes) |
| Seed safety | `npm run seed` with non-demo users present | ✅ refused (`Refusing to reset: … 5 non-demo user(s) …`) |
| Admin bootstrap safety | second `bootstrap:admin` run | ✅ refused (`An active System Administrator already exists`) |

## Unit tests (71)

| Suite | Tests | Covers |
|---|---|---|
| `rbac/access.spec.ts` (new) | 32 | Union of roles; revoked, pending, expired and future assignments ignored; temporary roles; active-role narrowing; **spoofed active role rejected**; no seniority inheritance; coach, sport, hostel and facility scopes; mis-scoped roles grant nothing; **expected grants and denials for each of the 18 roles**; only ADMIN holds `role.manage_permissions`; no non-privileged role holds sensitive permissions |
| `institution/import-parser.spec.ts` (new) | 11 | RFC 4180 CSV (quotes, CRLF, BOM), unterminated quotes, header normalisation, required columns, status rules (VERIFIED needs source and date; default UNVERIFIED / PENDING; EXPIRED), validation of email, https, dates and role hints, duplicate key normalisation, order-independent comparison |
| `ai/ai.service.spec.ts` (extended) | 8 | Offline answers, Claude streaming, refusal, fallback, plus **permission isolation**: analytics documents never reach a student, withheld context is never sent to Claude, staff do get it, unknown documents are denied by default |
| `otp`, `geo`, `hash-chain`, `bracket`, `forecast` (unchanged) | 20 | RFC 4226 / 6238 vectors, geofence, ledger chain, brackets, Holt-Winters |

## RBAC and workflow e2e (200), by section

| Section | Checks | Highlights |
|---|---|---|
| Roles and resolved permissions | 36 | Each of the 18 demo accounts: `/auth/me` lists the role and contains every default permission |
| Endpoint enforcement matrix | 23 probes × 18 roles | For each probe every role is called; allowed roles must not get 401/403 and denied roles must get exactly 403. Probes include analytics (view, participation, integrity, export), users, audit, schedules, entry log, inventory alerts, ledger and requests, role approvals, imports, tasks, AI usage, and create endpoints for facilities, clubs, items, broadcasts, announcements, sessions, tournaments and the matrix |
| Direct API access and spoofing | 11 | No token → 401; tampered signature → 401; `X-Active-Role` for an unheld role → 403 (not ignored); a multi-role user narrowed to one role loses the other's powers; mass-assignment field → 400; SQL-looking input treated as data; directory hides phones |
| Scope isolation | 26 | **Cross-club:** coach A can't open sessions, read OTPs, edit rosters, announce or read reports for club B, or see unrelated students. **Cross-sport:** cricket coordinator vs football. **Cross-hostel:** registration and residency checks; one team per player. **Cross-facility:** a scoped ground staff member is created through the real workflow and limited to their facility and its schedule |
| Role-assignment safeguards | 24 | Self-assignment, ADMIN by PESO or Dean, and Dean → Sports Officer (escalation) are all blocked; student office-bearers can't assign; scope required; privileged → pending → approved by a second person → effective next request; revoke needs `role.approve`; revocation is immediate on the same token; history kept; **temporary role lapses at `validUntil`**; admin lock-out protection; matrix grants apply and revert immediately; a deactivated account's token stops working |
| Bookings | 8 | **6 concurrent requests for one slot → exactly 1 succeeds, 5 get 409**; reschedule conflict 409; reschedule OK; others can't reschedule; cancelling for someone else needs a reason; the entry log carries minimal data |
| Inventory ledger | 15 | **8 concurrent issues on 3 units → exactly 3 succeed**; return with damage, loss, repair, over-damage 409, adjustment, write-off; ground staff can't adjust; **ledger deltas reconcile exactly with stock**; invariant holds; request → approve (not self) → fulfil once |
| Attendance corrections | 7 | Non-member rejected; manual add; **duplicate prevented**; other coach blocked; record is `MANUAL` with `latitude = null` (no fabricated GPS); removal; history |
| Complaints | 16 | Visibility (unassigned staff and other students get 404); assignment rules; resolution note required; reopen; escalation only by a manager; Dean sees escalated complaints; raiser can only close after resolution; PNG accepted; **disguised script rejected by content sniffing**; others can't download; analytics |
| Tournaments, announcements, tasks | 15 | GSec proposal → no registration before approval → SPEC approves; media can't record results; announcement: unapproved can't publish, author can't approve, students see it only after publication; leaderboard; tasks only to task-taking staff, only the assignee updates |
| Institutional import | 14 | Coach blocked; preview finds 2 valid and 3 errors (bad email, VERIFIED without source, in-file duplicate); **preview writes nothing**; commit refuses errors unless `allowErrors`; no double commit; students see only VERIFIED (no phone); unsourced rows stay UNVERIFIED; CREATE_ONLY never overwrites; UPSERT updates; **rollback restores the previous values**; rollback refuses after a later edit |
| AI isolation (HTTP) | 5 | Student gets no analytics documents and no integrity figures; Sports Officer does; council gets participation but not integrity; usage log records withheld counts without content |

## Browser checks

* **Per role** (student, PESO, Dean, admin, coach, ground, security, media, hostel secretary): the expected nav items are
  present and the forbidden ones absent (for example, the admin has no Analytics or Tasks; security has no Analytics or Users).
  Every visited page loads with zero console errors and zero failed API calls.
* **Flows:** the role switcher narrows the UI and persists across reload; the permission matrix renders 1,200+ cells;
  the roles drawer assigns a role that then appears in history; an import preview shows 1 new / 1 error; a student sees
  no Manage controls; the organisation page shows the live matrix badge.

## Not tested / limits

* **Live Claude and Pinecone calls.** No keys were available. Those code paths are exercised with mocks only.
* **Mobile app at runtime.** It was type-checked but not run on a device or simulator.
* **Load and penetration testing** were not performed. Concurrency was tested at small scale (6 and 8 parallel requests).
* **Real institutional data.** None was available, since the official sites were unreachable (see `IIT_ISM_DATA_INTEGRATION.md`).
* The smoke and e2e suites need a freshly seeded **disposable** database and must run at least a minute apart, because of
  the login rate limit.
