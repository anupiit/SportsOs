# SportsOS — Database Changes

Migration: `apps/api/prisma/migrations/20261104160242_rbac_workflows_institutional_data/migration.sql`. The earlier
migration `20261022055751_init` is untouched.

## Safety properties

* **Additive only.** New tables, new nullable or defaulted columns, new enum values. The only `ALTER COLUMN` statements
  *relax* `NOT NULL` on four `AttendanceRecord` GPS columns, needed for manual corrections. Nothing is dropped or renamed,
  and no data is deleted.
* **Backfilled in the same migration**, so existing users keep exactly the access they had:
  * every `User` gets a `RoleAssignment` for their current `User.role`;
  * `CLUB_MEMBER` users become `STUDENT` (global) plus one `CLUB`-scoped `CLUB_MEMBER` assignment per **active** membership;
  * `HOSTEL_SECRETARY` takes the user's recorded `hostel` as its scope; `SPORT_COORDINATOR` gets an empty `SPORT` scope,
    so an administrator must set the sport (until then the role grants no sport-scoped powers);
  * every `Equipment` row gets an `INITIAL` `InventoryTransaction` matching its current quantities, so the new ledger
    reconciles from day one.
* Verified on the populated development database (≈2.8k bookings, 1k check-ins): the migration applied and the counts
  matched (152 assignments for 79 users and 71 active memberships; 15 opening-balance ledger rows). The smoke and e2e
  suites then passed against it. Also verified on an empty database with `prisma migrate deploy` (see `TEST_REPORT.md`).
* `prisma validate` and `prisma migrate status` are clean. The new enum values (`TournamentStatus.PROPOSED/REJECTED`,
  `ComplaintCategory.SECURITY/MAINTENANCE`) are added with `ALTER TYPE … ADD VALUE` and not used inside the same
  transaction.

## New tables

| Table | Purpose | Key constraints / indexes |
|---|---|---|
| `RoleAssignment` | One role held by one user, scoped (`GLOBAL`/`CLUB`/`HOSTEL`/`SPORT`/`FACILITY`), time-bound (`validFrom`, `validUntil`), with `status` (`PENDING_APPROVAL`, `ACTIVE`, `REJECTED`, `REVOKED`, `EXPIRED`), requester, decider and revoker. Never deleted, so it is the role history. | `(userId, status)`, `(role, status)`; FK cascade on user delete |
| `RolePermission` | Live role → permission matrix | PK `(role, permission)` |
| `PermissionDefinition` | Permissions the API has registered; a new key gets its default grants once, so later edits persist across deploys | PK `key` |
| `InventoryTransaction` | Stock ledger: type, quantity, per-counter deltas, resulting balances, actor, issue or request reference | `(equipmentId, createdAt)` |
| `EquipmentRequest` | Equipment requests with approval and fulfilment | `(status, createdAt)` |
| `AttendanceCorrection` | Manual ADD / REMOVE with reason and actor | `(sessionId)` |
| `TeamMember` | Tournament team rosters | unique `(teamId, userId)` |
| `ComplaintAttachment` | Attachments (≤ 2 MB, type-sniffed) stored as `bytea` | FK cascade on complaint |
| `Announcement` | Club announcements and official announcements with a DRAFT → SUBMITTED → APPROVED → PUBLISHED workflow | `(status, createdAt)` |
| `OperationalTask` | Maintenance, operations and security tasks for staff | `(assigneeId, status)` |
| `AiUsageLog` | AI request metadata (kind, provider, model, status, tokens, latency, docs used and withheld). **No question or answer text.** | `(createdAt)`; user FK `SET NULL` |
| `InstitutionalRecord` | IIT (ISM) reference data with provenance: `sourceUrl`, `sourceDocument`, `verifiedAt`, `verifiedById`, `validUntil`, `dataStatus`, `importBatchId`, `linkedUserId` | unique `(kind, externalKey)` for dedupe; `(kind, dataStatus)` |
| `ImportBatch`, `ImportBatchItem` | Import preview, commit and rollback, with per-row action and before/after snapshots | `(batchId)` |

## New columns

| Model | Columns |
|---|---|
| `User` | `isDemo` |
| `Facility`, `Club`, `Equipment`, `Tournament` | `isDemo` |
| `Booking` | `checkedInById`, `cancelledById`, `cancelReason`, `rescheduleCount` |
| `AttendanceRecord` | `method` (`VERIFIED`/`MANUAL`); `latitude`, `longitude`, `accuracyM`, `distanceM` now nullable |
| `Tournament` | `approvedById`, `approvedAt`, `reviewNote` |
| `Team` | `registeredById` |
| `Complaint` | `escalated`, `escalatedAt`, `escalatedById`, `escalationNote`, `resolvedAt`, `closedAt`, `closedById`, `reopenCount`; index `(status, createdAt)` |

`User.role` is kept as a **display / primary role** and is synchronised from assignments (`syncPrimaryRole`). Authorization
never reads it.

## Consistency mechanisms

| Concern | Mechanism |
|---|---|
| Double booking | Per-facility `pg_advisory_xact_lock` and an overlap check inside the transaction (create, approve, reschedule) |
| Stock overdraw | `applyStock()`: a conditional `UPDATE … WHERE availableQty >= n` (and likewise for damaged and total) plus the ledger row, in one transaction |
| Duplicate attendance | Unique `(sessionId, userId)`; corrections check inside the transaction |
| Concurrent role changes | Per-user advisory lock; a global lock for the last-admin check |
| Import races | A global advisory lock on commit and rollback; `updatedAt` snapshot comparison |
| Announcement or request double action | Conditional `updateMany … WHERE status = <expected>` |
| Audit | Every state change appends to the SHA-256 hash-chained `AuditLog` in the same transaction |

## Seed

`npm run seed` (`apps/api/prisma/seed.ts`) now loads `apps/api/.env` itself. It refuses to truncate a database holding
non-demo users, institutional records or imports unless `SEED_FORCE_RESET=true`, and never runs with
`NODE_ENV=production` without `SEED_ALLOW_PRODUCTION=true`. All rows it creates are `isDemo`.
