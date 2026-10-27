# SportsOS REST API contract

Base URL: `http://localhost:4000/api` (configurable; web reads `NEXT_PUBLIC_API_URL`, mobile reads `EXPO_PUBLIC_API_URL`).

* Auth: `Authorization: Bearer <accessToken>` on every route except `POST /auth/login`, `POST /auth/register`, `GET /health`.
* All bodies are JSON. Dates are ISO-8601 strings. Response shapes are the TypeScript interfaces in
  `packages/shared/src/types.ts` (named in the table below).
* Request bodies are validated strictly: unknown fields are rejected with 400.
* Errors: `{ statusCode, message, error }` (`message` may be a string array for validation errors).
  `401` = missing/expired token, `403` = role lacks the permission, `409` = conflict (e.g. overlapping booking).
* "perm:" = permission required (see `packages/shared/src/permissions.ts`). No perm = any signed-in user.

## Auth & users

| Method | Path | Body / query | Returns | Notes |
|---|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `AuthResponse` | |
| POST | `/auth/register` | `{ name, email, password, admissionNo?, hostel?, phone? }` | `AuthResponse` | New users get role `STUDENT`. Email must end with `ALLOWED_EMAIL_DOMAIN` (default `iitism.ac.in`). |
| GET | `/auth/me` | | `MeResponse` | |
| GET | `/users` | `?q=&role=` | `User[]` | perm: `users:read` |
| PATCH | `/users/:id` | `{ role?, isActive?, hostel?, phone? }` | `User` | perm: `users:manage` |
| GET | `/users/:id/profile` | | `UserProfile` = `{ user, stats: { checkIns, bookings, tournaments }, achievements, clubs }` | self or `users:read` |

## Facilities & bookings

| Method | Path | Body / query | Returns | Notes |
|---|---|---|---|---|
| GET | `/facilities` | | `Facility[]` | |
| GET | `/facilities/:id` | | `Facility` | |
| POST | `/facilities` | `Facility` fields minus id/updatedAt | `Facility` | perm: `facilities:manage` |
| PATCH | `/facilities/:id` | partial (all fields except `code`, which is fixed at creation) | `Facility` | perm: `facilities:manage` |
| PATCH | `/facilities/:id/status` | `{ status, note? }` | `Facility` | perm: `facilities:status` (ground staff) |
| GET | `/facilities/:id/availability` | `?date=YYYY-MM-DD` | `FacilityAvailability` | slots of `slotMinutes` between open/close |
| GET | `/bookings` | `?scope=mine\|all&status=&facilityId=&from=&to=` | `Booking[]` | `scope=all` needs `bookings:read_all` (default `mine`) |
| POST | `/bookings` | `{ facilityId, start, end, purpose, type, clubId?, participants? }` | `Booking` | 409 on overlap; auto-approved for CASUAL when facility `requiresApproval=false` |
| GET | `/bookings/:id` | | `Booking` | owner or `bookings:read_all` |
| POST | `/bookings/:id/approve` | | `Booking` | perm: `bookings:approve` |
| POST | `/bookings/:id/reject` | `{ reason }` | `Booking` | perm: `bookings:approve` |
| POST | `/bookings/:id/cancel` | | `Booking` | owner or `bookings:approve` |
| GET | `/bookings/:id/pass` | | `BookingPass` | owner only; QR (`sportsos://pass/<token>`) shown at the gate |
| POST | `/bookings/check-in` | `{ token }` | `Booking` | perm: `bookings:checkin` (security scans pass QR) |

## Clubs

| Method | Path | Body / query | Returns | Notes |
|---|---|---|---|---|
| GET | `/clubs` | | `Club[]` (with `myMembership`) | |
| GET | `/clubs/:id` | | `Club` (with `members`) | |
| POST | `/clubs` | `{ name, sport, description?, coachId? }` | `Club` | perm: `clubs:manage` |
| POST | `/clubs/:id/join` | | `ClubMembership` | creates PENDING membership |
| PATCH | `/clubs/:id/members/:membershipId` | `{ status?, role? }` | `ClubMembership` | perm: `clubs:roster`; ACTIVE promotes STUDENT → CLUB_MEMBER |

## Verified attendance (OTP + GPS geofence)

| Method | Path | Body / query | Returns | Notes |
|---|---|---|---|---|
| POST | `/attendance/sessions` | `{ title, facilityId, clubId?, startsAt?, endsAt }` | `AttendanceSession` | perm: `attendance:manage` |
| GET | `/attendance/sessions` | `?status=ACTIVE\|CLOSED` | `AttendanceSession[]` | managers see their own sessions; others see sessions they can join |
| GET | `/attendance/sessions/:id` | | `AttendanceSession` (with `records`) | |
| GET | `/attendance/sessions/:id/otp` | | `SessionOtp` | creator or `attendance:manage`; code rotates every `otpStepSeconds` (30 s) |
| POST | `/attendance/sessions/:id/close` | | `AttendanceSession` | |
| POST | `/attendance/check-in` | `CheckInRequest` | `CheckInResult` | always 200/201 with `outcome`; only `ACCEPTED` writes a record |
| GET | `/attendance/me` | | `AttendanceRecord[]` | |

Check-in rules: OTP must match the current or previous 30 s step; distance from facility centre
(haversine) must be ≤ `geofenceRadiusM` + min(accuracy, 25 m); accuracy worse than 100 m is rejected;
one record per student per session; one device per session (`deviceId` reuse by another student is rejected);
club sessions only accept ACTIVE members of that club.

## Inventory (QR) & audit chain

| Method | Path | Body / query | Returns | Notes |
|---|---|---|---|---|
| GET | `/inventory/items` | `?q=&sport=&lowStock=true` | `EquipmentItem[]` | |
| GET | `/inventory/items/:id` | | `EquipmentItem & { issues: EquipmentIssue[] }` | `issues` = all loans for `inventory:issue`, otherwise only the caller's |
| GET | `/inventory/items/by-qr/:code` | | `EquipmentItem` | used by the mobile scanner |
| GET | `/inventory/items/:id/qr` | | `{ qrCode, qrDataUrl }` | printable label; QR encodes `sportsos://equipment/<qrCode>` |
| POST | `/inventory/items` | `{ name, sport, category, totalQty, minStock, location? }` | `EquipmentItem` | perm: `inventory:manage` |
| PATCH | `/inventory/items/:id` | `{ name?, category?, minStock?, location? }` | `EquipmentItem` | perm: `inventory:manage` |
| POST | `/inventory/items/:id/restock` | `{ quantity, note? }` | `EquipmentItem` | perm: `inventory:manage` |
| GET | `/inventory/issues` | `?status=&scope=mine\|all` | `EquipmentIssue[]` | `all` needs `inventory:issue` |
| POST | `/inventory/issues` | `{ equipmentId? , qrCode?, borrower (email or admission no.), quantity, dueAt?, note? }` | `EquipmentIssue` | perm: `inventory:issue` |
| POST | `/inventory/issues/:id/return` | `{ returnedQty, damagedQty?, note? }` | `EquipmentIssue` | perm: `inventory:issue` |
| GET | `/inventory/alerts` | | `InventoryAlerts` | perm: `inventory:issue` |
| GET | `/audit` | `?entity=&limit=50` | `AuditEntry[]` (newest first) | perm: `audit:read` |
| GET | `/audit/verify` | | `AuditVerification` | perm: `audit:read`; recomputes the SHA-256 hash chain |

## Tournaments

| Method | Path | Body / query | Returns | Notes |
|---|---|---|---|---|
| GET | `/tournaments` | | `Tournament[]` | |
| GET | `/tournaments/:id` | | `Tournament` (with `teams`, `matches`, `standings` for round robin) | |
| POST | `/tournaments` | `{ name, sport, format, startDate, description?, facilityId? }` | `Tournament` | perm: `events:manage` |
| POST | `/tournaments/:id/teams` | `{ name, hostel?, seed? }` | `Team` | perm: `events:manage`; DRAFT only |
| DELETE | `/tournaments/:id/teams/:teamId` | | `{ ok: true }` | perm: `events:manage`; DRAFT only |
| POST | `/tournaments/:id/generate` | `{ startAt?, matchMinutes? }` | `Tournament` | perm: `events:manage`; seeds bracket (byes for top seeds) or round-robin (circle method) |
| PATCH | `/matches/:id` | `{ homeScore?, awayScore?, status?, scheduledAt?, facilityId? }` | `Match` | perm: `events:score`; COMPLETED advances the winner |

## Notifications, complaints, achievements

| Method | Path | Body / query | Returns | Notes |
|---|---|---|---|---|
| GET | `/notifications` | | `Notification[]` (latest 50) | |
| GET | `/notifications/unread-count` | | `{ count }` | |
| POST | `/notifications/:id/read` | | `Notification` | |
| POST | `/notifications/read-all` | | `{ updated }` | |
| POST | `/notifications/broadcast` | `{ title, body, roles?: Role[] }` | `{ sent }` | perm: `notifications:broadcast` (no roles = everyone) |
| GET | `/complaints` | `?status=` | `Complaint[]` | own complaints, or all with `complaints:manage` |
| POST | `/complaints` | `{ category, subject, description, facilityId?, equipmentId?, priority? }` | `Complaint` | |
| PATCH | `/complaints/:id` | `{ status?, priority?, assignedToId?, resolution? }` | `Complaint` | perm: `complaints:manage` |
| GET | `/achievements` | `?userId=&verified=` | `Achievement[]` | |
| POST | `/achievements` | `{ title, sport, level, position?, date }` | `Achievement` | self-submitted, unverified |
| POST | `/achievements/:id/verify` | | `Achievement` | perm: `achievements:verify` |

## Analytics (perm: `analytics:read`)

| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/analytics/overview` | | `OverviewKpis` |
| GET | `/analytics/participation` | `?weeks=12` | `ParticipationPoint[]` |
| GET | `/analytics/utilization` | `?days=30` | `UtilizationReport` |
| GET | `/analytics/forecast` | `?facilityId=&horizon=14&history=56` | `ForecastReport` (omit facilityId = all facilities). Past dates carry `actual` plus the model's in-sample one-step `forecast` (null for the first week); future dates carry `forecast`, `lower`, `upper`. |
| GET | `/analytics/equipment` | | `EquipmentInsight[]` |
| GET | `/analytics/integrity` | `?days=30` | `IntegrityReport` |

## AI analytics suite

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| GET | `/ai/status` | | `AiStatus` | |
| POST | `/ai/ask` | `AiAskRequest` | `AiAnswer` | any signed-in user |
| POST | `/ai/ask/stream` | `AiAskRequest` | `text/event-stream` | see below |
| POST | `/ai/report` | `{ period: 'week' \| 'month' }` | `AiReport` | perm: `ai:report` |
| POST | `/ai/reindex` | | `{ indexed }` | perm: `ai:report` |

`/ai/ask/stream` emits SSE `data:` lines, each a JSON object:
`{ "type": "sources", "sources": AiSource[] }` → zero or more `{ "type": "delta", "text": "..." }` →
`{ "type": "done", "generatedBy": "claude" | "offline" }` (or `{ "type": "error", "message": "..." }`).
`AiSource.score` is the raw retrieval score (BM25 locally, cosine similarity with Pinecone) — compare within one answer, not across modes.

## QR payloads

Every QR code SportsOS prints is a `sportsos://` URI so one scanner can route by prefix:

| QR | Payload | Scanner action |
|---|---|---|
| Equipment label | `sportsos://equipment/<qrCode>` | `GET /inventory/items/by-qr/<qrCode>` |
| Booking gate pass | `sportsos://pass/<token>` | `POST /bookings/check-in { token }` (the API also accepts the full URI) |
| Attendance session | `sportsos://checkin?session=<sessionId>` | open check-in for that session (OTP still required) |

## Health

`GET /health` → `{ status: 'ok', db: boolean, time }`

## Demo accounts (after `npm run db:seed`)

Password for every demo account: `sportsos123`.

| Role | Email |
|---|---|
| ADMIN | admin@iitism.ac.in |
| DIRECTOR | director@iitism.ac.in |
| DEAN_SW | dean.sw@iitism.ac.in |
| SPEC_PRESIDENT | spec.president@iitism.ac.in |
| SPORTS_OFFICER | peso@iitism.ac.in |
| GENERAL_SECRETARY | gsec.sports@iitism.ac.in |
| EVENT_COMMITTEE | events@iitism.ac.in |
| COACH | coach.football@iitism.ac.in, coach.basketball@iitism.ac.in |
| GROUND_STAFF | ground@iitism.ac.in |
| EQUIPMENT_MANAGER | equipment@iitism.ac.in |
| SECURITY_STAFF | security@iitism.ac.in |
| OPERATIONS_STAFF | operations@iitism.ac.in |
| SPORTS_COUNCIL | council@iitism.ac.in |
| SPORT_COORDINATOR | coord.cricket@iitism.ac.in |
| HOSTEL_SECRETARY | hostelsec.jasper@iitism.ac.in |
| MEDIA_NOMINEE | media@iitism.ac.in |
| CLUB_MEMBER | 22je0143@iitism.ac.in (and ~60 generated students) |
| STUDENT | student@iitism.ac.in |
