# SportsOS — RBAC Permission Matrix

Generated from `packages/shared/src/permissions.ts` (`DEFAULT_ROLE_PERMISSIONS`). These are the **defaults**. At runtime the
API reads the live matrix from the `RolePermission` table, which a System Administrator can edit under
`Administration → Roles & permissions` (or `PUT/DELETE /api/rbac/matrix/:role/:permission`). Every edit is audited.

## Principles

1. **Explicit grants, no inheritance.** A role holds only the permissions listed for it. Seniority on the organisation
   chart (Dean → President SPEC → Sports Officer → …) adds nothing. For example, the Dean cannot approve bookings or issue
   equipment, and the System Administrator is not an operational approver.
2. **Backend enforcement.** Every protected route declares `@RequirePermission(...)` or `@RequireAnyPermission(...)`,
   checked by the global `PermissionsGuard`. Services then apply **scope** and **ownership** checks (see below). The web
   and mobile clients only hide controls.
3. **Trusted resolution.** On every request `JwtAuthGuard` verifies the JWT and rebuilds the principal from the database:
   the user's effective `RoleAssignment`s (ACTIVE and inside their validity window) map through the live matrix to a
   permission set. The role claim in the token is ignored.
4. **Multiple roles.** Permissions are the union over all effective assignments. A client may send `X-Active-Role` to act
   as one held role. The server verifies the user holds it (otherwise 403) and then uses only that role's grants.
5. **Least privilege for data.** The directory hides phone numbers without `user.update`. Security staff see name and
   admission number only. Coaches see only their own players. Complaint handlers see only complaints assigned to them.
   The AI receives only documents the asker could read through the REST API.

## Roles

`DIR` Director, IIT (ISM) Dhanbad · `DSW` Dean (Students' Welfare) · `SPEC` President, SPEC · `PESO` Sports Officer (PESO) · `GSEC` General Secretary · `EVT` Event Committee · `COACH` Coach · `GRND` Ground Staff · `EQP` Equipment Manager · `SEC` Security Staff · `OPS` Operations Staff · `CNCL` Sports Council · `CORD` Sports-specific Coordinator · `HSEC` Hostel Sports Secretary · `MEDIA` Tech, Media & Content Nominee · `CLUB` Club Member · `STU` Casual Student · `ADMIN` System Administrator

`DIRECTOR` is kept from the original implementation, so there are 18 roles in total: the 17 organisational roles plus the Director.

## Default matrix

| Permission | DIR | DSW | SPEC | PESO | GSEC | EVT | COACH | GRND | EQP | SEC | OPS | CNCL | CORD | HSEC | MEDIA | CLUB | STU | ADMIN |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `facility.view` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| `facility.manage` |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `facility.update_status` |  |  |  | ● |  |  |  | ● |  |  | ● |  |  |  |  |  |  |  |
| `booking.create` |  |  |  | ● | ● | ● | ● | ● |  |  |  | ● | ● | ● | ● | ● | ● |  |
| `booking.view_own` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| `booking.view_all` | ● | ● | ● | ● |  | ● |  | ● |  |  | ● |  |  |  |  |  |  |  |
| `booking.approve` |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `booking.reject` |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `booking.cancel` |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `booking.manage` |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `booking.verify` |  |  |  | ● |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |
| `inventory.view` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| `inventory.create` |  |  |  | ● |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |
| `inventory.update` |  |  |  | ● |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |
| `inventory.issue` |  |  |  | ● |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |
| `inventory.return` |  |  |  | ● |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |
| `inventory.audit` |  |  |  | ● |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |
| `inventory.request` |  |  |  | ● | ● |  | ● |  |  |  |  | ● | ● |  |  | ● |  |  |
| `inventory.approve_request` |  |  |  | ● |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |
| `attendance.mark` |  |  |  |  | ● |  |  |  |  |  |  | ● | ● | ● | ● | ● | ● |  |
| `attendance.view_own` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| `attendance.view_team` | ● | ● | ● | ● |  |  | ● |  |  |  |  |  | ● |  |  |  |  |  |
| `attendance.manage` |  |  |  | ● |  |  | ● |  |  |  |  |  | ● |  |  |  |  |  |
| `club.view` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| `club.create` |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `club.manage` |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `club.manage_own` |  |  |  |  |  |  | ● |  |  |  |  |  | ● |  |  |  |  |  |
| `club.announce` |  |  |  | ● |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |
| `event.view` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| `event.create` |  |  |  | ● | ● | ● |  |  |  |  |  | ● | ● | ● |  |  |  |  |
| `event.update` |  |  |  | ● |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |
| `event.approve` |  | ● | ● | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `event.publish` |  |  |  | ● |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |
| `event.manage_participants` |  |  |  | ● |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |
| `event.register_team` |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |
| `event.record_results` |  |  |  | ● |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |
| `complaint.create` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| `complaint.view_own` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| `complaint.view_all` |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `complaint.view_escalated` | ● | ● | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `complaint.assign` |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `complaint.resolve` |  | ● | ● | ● |  |  |  | ● | ● |  | ● |  |  |  |  |  |  |  |
| `complaint.close` |  | ● |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `complaint.escalate` |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `announcement.draft` |  |  |  |  | ● | ● |  |  |  |  |  | ● |  |  | ● |  |  |  |
| `announcement.approve` |  | ● | ● | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `announcement.publish` |  |  |  | ● |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |
| `notification.broadcast` |  | ● | ● | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `task.view_assigned` |  |  |  | ● |  |  |  | ● |  |  | ● |  |  |  |  |  |  |  |
| `task.update_assigned` |  |  |  | ● |  |  |  | ● |  |  | ● |  |  |  |  |  |  |  |
| `task.manage` |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `achievement.verify` |  |  |  | ● |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |
| `user.view` |  | ● |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |
| `user.create` |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |
| `user.update` |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |
| `user.deactivate` |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |
| `role.assign` |  | ● |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |
| `role.revoke` |  | ● |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |
| `role.approve` |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |
| `role.manage_permissions` |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |
| `institution.view` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| `institution.import` |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |
| `analytics.view` | ● | ● | ● | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `analytics.participation` | ● | ● | ● | ● | ● |  |  |  |  |  |  | ● |  |  |  |  |  |  |
| `analytics.export` | ● | ● | ● | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `ai.use` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| `ai.report` | ● | ● | ● | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `ai.manage` |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |
| `audit.view` | ● | ● | ● | ● |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |
| `system.view` |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |
| **Total** | 18 | 27 | 22 | 61 | 16 | 18 | 17 | 16 | 17 | 11 | 15 | 16 | 17 | 14 | 14 | 13 | 12 | 22 |

## Scopes

| Role | Scope | Effect |
|---|---|---|
| Coach | Clubs where `Club.coachId` = the user | `attendance.manage`, `attendance.view_team`, `club.manage_own`, `club.announce` apply only to those clubs |
| Club Member | `CLUB` (required), one assignment per active membership | Granted and revoked automatically when a membership is approved or ends |
| Sports-specific Coordinator | `SPORT` (required), e.g. `Cricket` | Roster, attendance and practice booking for clubs of that sport only |
| Hostel Sports Secretary | `HOSTEL` (required) | `event.register_team` only for teams of that hostel, with members who live there |
| Ground Staff | `FACILITY` (optional) | When scoped: status changes and booking schedule only for the assigned facility |

A role whose scope is *required* grants no scoped power if mis-assigned globally.

## Assignment safeguards (enforced in `RoleAssignmentsService`)

* Needs `role.assign`. Revocation needs `role.revoke`. Nobody can change their own roles.
* **Privileged roles** (`ADMIN`, `DIRECTOR`, `DEAN_SW`, `SPEC_PRESIDENT`, `SPORTS_OFFICER`) are created as
  `PENDING_APPROVAL` and grant nothing until a **different** person with `role.approve` approves them. The requester and
  the target cannot approve. Revoking a privileged role also needs `role.approve`.
* Only a System Administrator can request, approve or revoke `ADMIN`. The last active administrator can be neither
  revoked nor deactivated.
* **No escalation by proxy.** A non-administrator cannot grant a role that carries any *sensitive* permission they don't
  hold themselves (`role.*`, `user.create`, `user.update`, `user.deactivate`, `audit.view`, `ai.manage`,
  `institution.import`, `system.view`). For example, the Dean cannot appoint a Sports Officer, because the Sports Officer
  holds `user.update` and `institution.import`.
* The matrix can't remove the administrator's lock-out permissions (`role.assign`, `role.revoke`, `role.approve`,
  `role.manage_permissions`, `user.view`, `user.update`).
* Assignments carry `validFrom` and `validUntil` (temporary roles), a reason, the requester, the decider and the revoker.
  They are never deleted, so the table is the role history. A job marks lapsed ones `EXPIRED` every 10 minutes, and
  resolution already ignores them at `validUntil`.
* Every change writes to the hash-chained audit ledger.

## Workflow rules that are not plain permission checks

| Rule | Where |
|---|---|
| Nobody approves or rejects their own booking, equipment request, tournament proposal, announcement or role request | services |
| Cancelling or rescheduling someone else's booking needs `booking.cancel` and a reason, and notifies the owner | `BookingsService` |
| Tournaments created without `event.approve` start as `PROPOSED` and are hidden from students until approved | `TournamentsService` |
| Announcements reach students only after `SUBMITTED → APPROVED → PUBLISHED`. Media can publish only `APPROVED` content | `AnnouncementsService` |
| Complaints: assignment needs `complaint.assign`. Status and resolution belong to the assigned handler, managers, or leadership for escalated complaints. The raiser can close after resolution and reopen within 14 days | `ComplaintsService` |
| Attendance corrections need a reason, create `MANUAL` records without GPS, and are kept as history | `AttendanceService` |
| Stock quantities change only through ledgered movements | `applyStock()` |

## Permission catalogue

| Permission | Meaning |
|---|---|
| `facility.view` | Browse facilities and availability |
| `facility.manage` | Create and configure facilities |
| `facility.update_status` | Mark facilities open / under maintenance / closed (scoped for ground staff) |
| `booking.create` | Request facility bookings |
| `booking.view_own` | View own bookings |
| `booking.view_all` | View the booking schedule of all (or assigned) facilities |
| `booking.approve` | Approve booking requests |
| `booking.reject` | Reject booking requests with a reason |
| `booking.cancel` | Cancel or reschedule other people's bookings |
| `booking.manage` | Override booking rules (block slots, bypass approval) |
| `booking.verify` | Verify gate passes and record facility entry |
| `inventory.view` | View the equipment catalogue and stock levels |
| `inventory.create` | Add equipment to the catalogue |
| `inventory.update` | Edit equipment, adjust stock, record damage or write-offs |
| `inventory.issue` | Issue equipment to borrowers |
| `inventory.return` | Receive returned equipment |
| `inventory.audit` | View loan history, stock ledger, alerts and inventory reports |
| `inventory.request` | Submit equipment requests |
| `inventory.approve_request` | Approve or reject equipment requests |
| `attendance.mark` | Check in to verified attendance sessions |
| `attendance.view_own` | View own attendance history |
| `attendance.view_team` | View attendance of assigned teams / clubs |
| `attendance.manage` | Open and close sessions and correct attendance (scoped) |
| `club.view` | View clubs and join requests |
| `club.create` | Create clubs |
| `club.manage` | Manage any club: details, coach, roster |
| `club.manage_own` | Manage the roster of clubs one coaches or coordinates |
| `club.announce` | Post announcements to clubs one leads |
| `event.view` | View tournaments and fixtures |
| `event.create` | Create tournaments (as proposals unless also event.approve) |
| `event.update` | Edit tournaments |
| `event.approve` | Approve tournament proposals |
| `event.publish` | Generate and publish fixtures |
| `event.manage_participants` | Register and remove teams and players in any tournament |
| `event.register_team` | Register teams for one’s own hostel |
| `event.record_results` | Record match results |
| `complaint.create` | Raise complaints and incident reports |
| `complaint.view_own` | View own complaints |
| `complaint.view_all` | View every complaint |
| `complaint.view_escalated` | View escalated complaints |
| `complaint.assign` | Assign complaints to staff |
| `complaint.resolve` | Work on and resolve complaints assigned to oneself |
| `complaint.close` | Close complaints |
| `complaint.escalate` | Escalate complaints to leadership |
| `announcement.draft` | Draft announcements and submit them for approval |
| `announcement.approve` | Approve or reject submitted announcements |
| `announcement.publish` | Publish approved announcements |
| `notification.broadcast` | Send direct notifications to roles |
| `task.view_assigned` | View operational tasks assigned to oneself |
| `task.update_assigned` | Update the status of assigned tasks |
| `task.manage` | Create and assign operational tasks |
| `achievement.verify` | Verify student achievements |
| `user.view` | Search the user directory (no phone numbers) |
| `user.create` | Create user accounts |
| `user.update` | Edit user accounts (incl. contact details) |
| `user.deactivate` | Deactivate and reactivate accounts |
| `role.assign` | Assign roles (privileged roles need approval) |
| `role.revoke` | Revoke role assignments |
| `role.approve` | Approve privileged role assignments |
| `role.manage_permissions` | Edit the role → permission matrix |
| `institution.view` | View verified institutional records (public directory) |
| `institution.import` | Import, verify and roll back institutional data |
| `analytics.view` | View institution-wide analytics |
| `analytics.participation` | View participation reports |
| `analytics.export` | Export analytics as CSV |
| `ai.use` | Use the SportsOS AI assistant |
| `ai.report` | Generate AI executive reports |
| `ai.manage` | Reindex the AI knowledge base and view AI usage |
| `audit.view` | View and verify the audit ledger |
| `system.view` | View system health and integration status |

## Verification

* `apps/api/src/rbac/access.spec.ts` asserts expected grants and denials for all 18 roles, plus resolution, scope and
  active-role behaviour.
* `apps/api/test/rbac.e2e.mjs` signs in as all 18 demo accounts and checks **23 endpoints × 18 roles** over HTTP against
  this matrix. It also covers cross-club, cross-sport, cross-hostel and cross-facility isolation, escalation attempts,
  temporary-role expiry and immediate revocation. See `TEST_REPORT.md`.
