# SportsOS — API Documentation

Base URL: `http://localhost:4000/api`. Auth: `Authorization: Bearer <JWT>` from `POST /auth/login`. Optional header
`X-Active-Role: <ROLE>` acts as one of your held roles (403 if you don't hold it). Request bodies are validated with a
whitelist: unknown fields return **400**. Errors use Nest's `{ statusCode, message, error }` shape. `401` means
unauthenticated, `403` missing permission or scope, `404` not found or not visible to you, `409` state conflict.

The original contract (payload shapes, QR formats, SSE events) is still described in [`docs/API.md`](API.md). This document
lists **every route with its guard** and details the endpoints added or changed in this pass.

## Every route and its guard

Generated from the controllers. "signed in" means any authenticated user, with ownership and scope enforced in the
service (for example, you can only cancel your own booking unless you hold `booking.cancel`).

| Method | Path | Guard |
|---|---|---|
| GET | `/api/achievements` | signed in (service-level checks) |
| POST | `/api/achievements` | signed in (service-level checks) |
| POST | `/api/achievements/:id/verify` | `achievement.verify` |
| GET | `/api/ai/status` | `ai.use` |
| POST | `/api/ai/ask` | `ai.use` |
| POST | `/api/ai/ask/stream` | `ai.use` |
| POST | `/api/ai/report` | `ai.report` |
| GET | `/api/ai/usage` | `ai.manage` |
| POST | `/api/ai/reindex` | `ai.manage` |
| GET | `/api/analytics/overview` | `analytics.view` |
| GET | `/api/analytics/participation` | any of `analytics.view`, `analytics.participation` |
| GET | `/api/analytics/utilization` | `analytics.view` |
| GET | `/api/analytics/forecast` | `analytics.view` |
| GET | `/api/analytics/equipment` | any of `analytics.view`, `inventory.audit` |
| GET | `/api/analytics/integrity` | `analytics.view` |
| GET | `/api/analytics/complaints` | any of `analytics.view`, `complaint.view_all` |
| GET | `/api/analytics/bookings` | `analytics.view` |
| GET | `/api/analytics/export` | `analytics.export` |
| GET | `/api/announcements` | signed in (service-level checks) |
| POST | `/api/announcements` | `announcement.draft` |
| PATCH | `/api/announcements/:id` | `announcement.draft` |
| POST | `/api/announcements/:id/submit` | `announcement.draft` |
| POST | `/api/announcements/:id/approve` | `announcement.approve` |
| POST | `/api/announcements/:id/reject` | `announcement.approve` |
| POST | `/api/announcements/:id/publish` | `announcement.publish` |
| POST | `/api/attendance/sessions` | `attendance.manage` |
| GET | `/api/attendance/sessions` | signed in (service-level checks) |
| GET | `/api/attendance/sessions/:id` | signed in (service-level checks) |
| GET | `/api/attendance/sessions/:id/otp` | `attendance.manage` |
| POST | `/api/attendance/sessions/:id/close` | `attendance.manage` |
| POST | `/api/attendance/sessions/:id/corrections` | `attendance.manage` |
| GET | `/api/attendance/sessions/:id/corrections` | any of `attendance.manage`, `attendance.view_team` |
| GET | `/api/attendance/reports/club/:clubId` | `attendance.view_team` |
| POST | `/api/attendance/check-in` | `attendance.mark` |
| GET | `/api/attendance/me` | `attendance.view_own` |
| GET | `/api/audit` | `audit.view` |
| GET | `/api/audit/verify` | `audit.view` |
| POST | `/api/auth/login` | public (rate-limited 10/min) |
| POST | `/api/auth/register` | public (rate-limited 5/min, @iitism.ac.in only) |
| GET | `/api/auth/me` | signed in (service-level checks) |
| GET | `/api/bookings` | `booking.view_own` |
| GET | `/api/bookings/entry-log` | `booking.verify` |
| POST | `/api/bookings` | `booking.create` |
| POST | `/api/bookings/check-in` | `booking.verify` |
| POST | `/api/bookings/:id/approve` | `booking.approve` |
| POST | `/api/bookings/:id/reject` | `booking.reject` |
| POST | `/api/bookings/:id/cancel` | signed in (service-level checks) |
| POST | `/api/bookings/:id/reschedule` | signed in (service-level checks) |
| GET | `/api/bookings/:id` | signed in (service-level checks) |
| GET | `/api/bookings/:id/pass` | signed in (service-level checks) |
| GET | `/api/clubs` | `club.view` |
| GET | `/api/clubs/:id` | `club.view` |
| POST | `/api/clubs` | `club.create` |
| PATCH | `/api/clubs/:id` | `club.manage` |
| POST | `/api/clubs/:id/join` | `club.view` |
| POST | `/api/clubs/:id/leave` | `club.view` |
| PATCH | `/api/clubs/:id/members/:membershipId` | `club.view` |
| GET | `/api/clubs/:id/announcements` | `club.view` |
| POST | `/api/clubs/:id/announcements` | `club.view` |
| GET | `/api/clubs/:id/calendar` | `club.view` |
| GET | `/api/complaints` | `complaint.view_own` |
| GET | `/api/complaints/:id` | `complaint.view_own` |
| POST | `/api/complaints` | `complaint.create` |
| PATCH | `/api/complaints/:id` | signed in (service-level checks) |
| POST | `/api/complaints/:id/escalate` | `complaint.escalate` |
| POST | `/api/complaints/:id/close` | signed in (service-level checks) |
| POST | `/api/complaints/:id/reopen` | signed in (service-level checks) |
| POST | `/api/complaints/:id/attachments` | signed in (service-level checks) |
| GET | `/api/complaints/:id/attachments/:attachmentId` | signed in (service-level checks) |
| GET | `/api/facilities` | `facility.view` |
| GET | `/api/facilities/:id` | `facility.view` |
| GET | `/api/facilities/:id/availability` | `facility.view` |
| POST | `/api/facilities` | `facility.manage` |
| PATCH | `/api/facilities/:id` | `facility.manage` |
| PATCH | `/api/facilities/:id/status` | `facility.update_status` |
| GET | `/api/health` | public |
| GET | `/api/institution/records` | `institution.view` |
| PATCH | `/api/institution/records/:id/status` | `institution.import` |
| POST | `/api/institution/records/:id/link` | `institution.import` |
| GET | `/api/institution/templates/:kind` | `institution.import` |
| GET | `/api/institution/imports` | `institution.import` |
| GET | `/api/institution/imports/:id` | `institution.import` |
| POST | `/api/institution/imports` | `institution.import` |
| POST | `/api/institution/imports/:id/commit` | `institution.import` |
| POST | `/api/institution/imports/:id/rollback` | `institution.import` |
| GET | `/api/inventory/items` | `inventory.view` |
| GET | `/api/inventory/items/by-qr/:code` | `inventory.view` |
| GET | `/api/inventory/items/:id` | `inventory.view` |
| GET | `/api/inventory/items/:id/qr` | `inventory.view` |
| GET | `/api/inventory/items/:id/transactions` | `inventory.audit` |
| GET | `/api/inventory/transactions` | `inventory.audit` |
| POST | `/api/inventory/items` | `inventory.create` |
| PATCH | `/api/inventory/items/:id` | `inventory.update` |
| POST | `/api/inventory/items/:id/restock` | `inventory.update` |
| POST | `/api/inventory/items/:id/damage` | `inventory.update` |
| POST | `/api/inventory/items/:id/repair` | `inventory.update` |
| POST | `/api/inventory/items/:id/write-off` | `inventory.update` |
| POST | `/api/inventory/items/:id/adjust` | `inventory.update` |
| GET | `/api/inventory/issues` | signed in (service-level checks) |
| POST | `/api/inventory/issues` | `inventory.issue` |
| POST | `/api/inventory/issues/:id/return` | `inventory.return` |
| GET | `/api/inventory/alerts` | any of `inventory.audit`, `inventory.issue` |
| GET | `/api/inventory/requests` | any of `inventory.request`, `inventory.approve_request` |
| POST | `/api/inventory/requests` | `inventory.request` |
| POST | `/api/inventory/requests/:id/approve` | `inventory.approve_request` |
| POST | `/api/inventory/requests/:id/reject` | `inventory.approve_request` |
| POST | `/api/inventory/requests/:id/fulfil` | `inventory.issue` |
| POST | `/api/inventory/requests/:id/cancel` | signed in (service-level checks) |
| GET | `/api/notifications` | signed in (service-level checks) |
| GET | `/api/notifications/unread-count` | signed in (service-level checks) |
| POST | `/api/notifications/read-all` | signed in (service-level checks) |
| POST | `/api/notifications/:id/read` | signed in (service-level checks) |
| POST | `/api/notifications/broadcast` | `notification.broadcast` |
| GET | `/api/rbac/matrix` | signed in (service-level checks) |
| PUT | `/api/rbac/matrix/:role/:permission` | `role.manage_permissions` |
| DELETE | `/api/rbac/matrix/:role/:permission` | `role.manage_permissions` |
| POST | `/api/rbac/matrix/:role/reset` | `role.manage_permissions` |
| GET | `/api/rbac/assignments/pending` | `role.approve` |
| GET | `/api/rbac/users/:userId/assignments` | `user.view` |
| POST | `/api/rbac/assignments` | `role.assign` |
| POST | `/api/rbac/assignments/:id/approve` | `role.approve` |
| POST | `/api/rbac/assignments/:id/reject` | `role.approve` |
| POST | `/api/rbac/assignments/:id/revoke` | `role.revoke` |
| GET | `/api/tasks` | any of `task.view_assigned`, `task.manage` |
| POST | `/api/tasks` | `task.manage` |
| PATCH | `/api/tasks/:id/status` | any of `task.update_assigned`, `task.manage` |
| GET | `/api/tournaments` | `event.view` |
| GET | `/api/tournaments/leaderboard` | `event.view` |
| GET | `/api/tournaments/:id` | `event.view` |
| POST | `/api/tournaments` | `event.create` |
| PATCH | `/api/tournaments/:id` | any of `event.update`, `event.create` |
| POST | `/api/tournaments/:id/approve` | `event.approve` |
| POST | `/api/tournaments/:id/reject` | `event.approve` |
| POST | `/api/tournaments/:id/teams` | any of `event.manage_participants`, `event.register_team` |
| DELETE | `/api/tournaments/:id/teams/:teamId` | any of `event.manage_participants`, `event.register_team` |
| POST | `/api/tournaments/:id/teams/:teamId/members` | any of `event.manage_participants`, `event.register_team` |
| DELETE | `/api/tournaments/:id/teams/:teamId/members/:memberId` | any of `event.manage_participants`, `event.register_team` |
| POST | `/api/tournaments/:id/generate` | `event.publish` |
| PATCH | `/api/matches/:id` | `event.record_results` |
| GET | `/api/users` | `user.view` |
| POST | `/api/users` | `user.create` |
| PATCH | `/api/users/:id` | signed in (service-level checks) |
| GET | `/api/users/:id/profile` | signed in (service-level checks) |

## Session

### `POST /auth/login` → `AuthResponse`

```json
{ "accessToken": "…", "user": { "id": "…", "name": "…", "role": "SPORTS_OFFICER", "isDemo": true, "…": "…" },
  "permissions": ["booking.approve", "…"], "heldRoles": ["SPORTS_OFFICER"], "activeRole": null,
  "roles": [{ "assignmentId": "…", "role": "SPORTS_OFFICER", "scopeType": "GLOBAL", "scopeId": "", "validUntil": null }] }
```

`GET /auth/me` returns the same without the token. `user.role` is the *display* role only.

## Role-based access control (`/rbac`)

| Endpoint | Body | Notes |
|---|---|---|
| `GET /rbac/matrix` | — | `{ roles: [{ role, permissions, defaults }], permissions: [{ key, description }] }` |
| `PUT /rbac/matrix/:role/:permission` | — | Grant (needs `role.manage_permissions`) |
| `DELETE /rbac/matrix/:role/:permission` | — | Revoke. Administrator lock-out permissions are refused (403) |
| `POST /rbac/matrix/:role/reset` | — | Restore the code defaults |
| `POST /rbac/assignments` | `{ userId, role, scopeType?, scopeId?, validFrom?, validUntil?, reason }` | Privileged roles → `PENDING_APPROVAL`; others → `ACTIVE`. 403 self/escalation, 400 bad scope, 409 duplicate |
| `POST /rbac/assignments/:id/approve` \| `/reject` | `{ note? }` | A different person from the requester and the target |
| `POST /rbac/assignments/:id/revoke` | `{ reason }` | Privileged roles need `role.approve`; the last admin is protected |
| `GET /rbac/users/:userId/assignments` | — | Full history incl. revoked and expired |
| `GET /rbac/assignments/pending` | — | Approval queue |

## Users

* `GET /users?q=&role=` (`user.view`). Returns `phone` only with `user.update`. The `role` filter matches any held role.
* `POST /users` (`user.create`): `{ name, email, temporaryPassword (≥10), admissionNo?, hostel?, phone? }`. Creates a
  `STUDENT`; staff roles are then assigned via `/rbac/assignments`.
* `PATCH /users/:id`: `{ name?, hostel?, phone? }` for yourself or with `user.update`; `{ isActive }` needs
  `user.deactivate`. **`role` is no longer accepted here** (400).
* `GET /users/:id/profile`: yourself, `user.view`, or a coach of a club the person actively belongs to.

## Bookings (changes)

* `POST /bookings/:id/reschedule` `{ start, end, reason? }`: owner or `booking.cancel`. Same rules as creation (hours,
  capacity, 30-day window, conflict check under the facility lock). Maximum of 3 reschedules unless `booking.manage`. An
  approved booking that needs approval goes back to `PENDING` unless an approver moves it.
* `POST /bookings/:id/cancel` `{ reason? }`: the reason is **required** when cancelling someone else's booking. The owner is
  notified.
* `POST /bookings/:id/approve` \| `/reject`: you can't decide on your own booking (403).
* `GET /bookings/entry-log?date=YYYY-MM-DD` (`booking.verify`): approved bookings for the day with `user: { id, name,
  admissionNo }` only.
* `GET /bookings?scope=all` (`booking.view_all`): ground staff with a facility scope see only their facilities.

## Attendance (new)

* `POST /attendance/sessions/:id/corrections` `{ student (id | email | admission no.), action: "ADD" | "REMOVE", reason (≥5) }`
  needs the session creator or staff whose scope covers the club. `ADD` creates a `MANUAL` record with
  `latitude/longitude/accuracyM/distanceM = null`. 409 on duplicates or non-members.
* `GET /attendance/sessions/:id/corrections`: correction history.
* `GET /attendance/reports/club/:clubId?days=30` (`attendance.view_team`, scoped): per-member attendance rate.

## Inventory (new)

Every quantity change writes one `InventoryTransaction` in the same transaction, with deltas and resulting balances.

| Endpoint | Body | Effect |
|---|---|---|
| `POST /inventory/items/:id/damage` | `{ quantity, note }` | store → damaged |
| `POST /inventory/items/:id/repair` | `{ quantity, note }` | damaged → store |
| `POST /inventory/items/:id/write-off` | `{ quantity, note, from: "AVAILABLE" \| "DAMAGED" }` | removes from stock |
| `POST /inventory/items/:id/adjust` | `{ availableDelta (≠0), note }` | stock-count correction |
| `GET /inventory/items/:id/transactions`, `GET /inventory/transactions?type=` | — | ledger (`inventory.audit`) |
| `POST /inventory/requests` | `{ equipmentId? \| itemName?, quantity, clubId?, neededBy?, reason }` | `inventory.request`; club requests need membership/leadership |
| `POST /inventory/requests/:id/approve` \| `/reject` | `{ note? }` | not by the requester |
| `POST /inventory/requests/:id/fulfil` | `{ dueAt? }` | issues to the requester via the ledger; 409 if already fulfilled |
| `POST /inventory/requests/:id/cancel` | — | requester only |

Moves that would make any counter negative return 409.

## Clubs (new)

`PATCH /clubs/:id` `{ name?, description?, coachId? }` (`club.manage`; the coach must hold `COACH`) ·
`POST /clubs/:id/leave` · `GET|POST /clubs/:id/announcements` (members read; coach/coordinator/`club.manage` post; members
are notified) · `GET /clubs/:id/calendar?from&to` (club bookings plus sessions). `GET /clubs/:id` now returns full rosters
only to leaders and `canManage` for the viewer.

## Tournaments (new)

* `POST /tournaments`: without `event.approve` the status is `PROPOSED` and reviewers are notified.
* `POST /tournaments/:id/approve` \| `/reject` `{ note? }` (`event.approve`, not your own).
* `PATCH /tournaments/:id`: organiser before fixtures, or `event.update`.
* `POST /tournaments/:id/teams`: `event.manage_participants`, or `event.register_team` for your own hostel only.
* `POST|DELETE /tournaments/:id/teams/:teamId/members[/:memberId]`: hostel teams accept only residents; one team per
  player per tournament.
* `GET /tournaments/leaderboard?sport=`: titles, played and wins by hostel or team.

## Complaints (new)

`GET /complaints/:id` · `POST /complaints/:id/escalate { note }` (`complaint.escalate`) ·
`POST /complaints/:id/close { note? }` (`complaint.close`, or the raiser once resolved) ·
`POST /complaints/:id/reopen { note }` (raiser within 14 days and up to 3 times, or `complaint.close`) ·
`POST /complaints/:id/attachments` (multipart `file`: JPEG, PNG, WebP or PDF identified by content, ≤ 2 MB, ≤ 3 files) ·
`GET /complaints/:id/attachments/:attachmentId` (download, `Content-Disposition: attachment`). Categories now include
`SECURITY` and `MAINTENANCE`.

## Announcements, tasks, institutional data, analytics, AI

* **Announcements:** `POST /announcements` → `PATCH /:id` → `POST /:id/submit` → `/approve` or `/reject` → `/publish`.
  `GET /announcements` returns published items for your roles, your own drafts, and the review queues you're allowed to see.
* **Tasks:** `GET /tasks?scope=all&status=`, `POST /tasks { title, description?, kind, facilityId?, assigneeId, dueAt? }`
  (the assignee must hold `task.update_assigned`), `PATCH /tasks/:id/status { status, note? }`.
* **Institution:** see [IIT_ISM_DATA_INTEGRATION.md](IIT_ISM_DATA_INTEGRATION.md).
* **Analytics:** new `GET /analytics/complaints?days=`, `GET /analytics/bookings?days=`, and
  `GET /analytics/export?report=participation|bookings|utilization|complaints&days=` (CSV, with spreadsheet formula
  injection neutralised).
* **AI:** `POST /ai/ask` and `/ai/ask/stream` need `ai.use`, and their retrieval is filtered by the caller's permissions.
  `GET /ai/usage` (`ai.manage`) returns request metadata only. `POST /ai/reindex` now needs `ai.manage`.
