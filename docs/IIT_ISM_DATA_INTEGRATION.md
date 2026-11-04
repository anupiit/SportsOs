# IIT (ISM) Dhanbad — Institutional Data Integration

## Status in one paragraph

**No real IIT (ISM) institutional data is included in this repository.** I tried all five official reference pages from this
build environment (`www.iitism.ac.in/our-team-dsw`, `/spec`, `/deans`, `people.iitism.ac.in/~dsw/spec/personnel.html`,
`/activity.html`). Both hosts failed DNS resolution under the session's network policy. I could not read the pages, so I
did not fill the gap from memory: no Dean, SPEC President, PESO, coach, office-bearer, hostel or facility name has been
entered as real data. Instead SportsOS ships a **controlled import pipeline** so an authorised administrator can load the
data from those official sources (or from DSW / SPEC documents) with provenance attached.

| Data | Source to use | Status in this build |
|---|---|---|
| Dean (Students' Welfare), Associate Deans | `https://www.iitism.ac.in/deans`, `/our-team-dsw` | **Not imported.** The site was unreachable from the build environment. |
| President, SPEC; PESOs; coaches | `https://www.iitism.ac.in/spec`, `https://people.iitism.ac.in/~dsw/spec/personnel.html` | **Not imported.** Same reason. |
| Sports and activities catalogue | `https://people.iitism.ac.in/~dsw/spec/activity.html` | **Not imported.** Same reason. |
| Facilities (grounds, courts, gym, pool…) | SPEC pages plus a field survey for coordinates and hours | **Not imported.** The bookable facilities in the demo seed are labelled `isDemo` placeholders. |
| General Secretary, Sports Council, hostel secretaries, coordinators, Event Committee, media nominees | An **authorised current roster** from DSW / the Gymkhana | **Not available publicly.** It needs an authorised document. |
| Student IDs, emails, hostel assignments | Institute systems (not public) | **Out of scope for import.** Students register themselves with their institute email. |

## Separation of real and synthetic data

* **DEMO seed** (`apps/api/prisma/seed.ts`). Every user, facility, club, equipment item and tournament it creates has
  `isDemo = true`. People are named `[DEMO] …` or `Demo Student NN`, emails use `@sportsos.demo`, admission numbers use the
  non-existent branch code `ZZ`, and hostels are `Hostel A–I`. The UI shows a **DEMO** badge for these records. The seed
  refuses to run when the database holds any non-demo user, institutional record or import, unless `SEED_FORCE_RESET=true`.
  It never runs with `NODE_ENV=production` unless `SEED_ALLOW_PRODUCTION=true` is also set.
* **Institutional records** (`InstitutionalRecord`) are a separate table from login accounts. Importing a person never
  creates an account or grants a role. An administrator can *link* a record to a registered user, and roles are then
  granted through the normal assignment workflow (privileged roles need two-person approval).
* **TEST data** created by the automated test suites is named `TEST …` and uses `example.org` URLs.

## Data statuses

| Status | Meaning | Who sees it |
|---|---|---|
| `VERIFIED` | Checked against a cited source (https URL or authorised document reference) on a recorded date | Everyone, in the **Directory** |
| `PENDING_VERIFICATION` | A source is cited but nobody has confirmed the row yet | Administrators only |
| `UNVERIFIED` | No source was given | Administrators only |
| `EXPIRED` | `valid_until` has passed. A nightly job (01:00) and the import itself set this. | Administrators only |

Rules enforced by the API:

* `VERIFIED` requires a source **and** `verified_on`. Rows that claim `VERIFIED` without both are rejected, never silently
  downgraded.
* With no explicit status, a row is `PENDING_VERIFICATION` if it cites a source and `UNVERIFIED` otherwise. It is never
  promoted automatically.
* Source URLs must be `https://`. `verified_on` cannot be in the future.
* Each record stores `sourceUrl`, `sourceDocument`, `verifiedAt`, `verifiedById`, `validUntil`, `dataStatus`,
  `importBatchId`, `createdAt` and `updatedAt` (the last-updated date).

## Import pipeline

`Administration → Institutional data` in the web app, or the API under `/api/institution/*` (permission
`institution.import`, held by default by the System Administrator and the Sports Officer).

1. **Template.** `GET /institution/templates/:kind` returns the CSV header for `PERSONNEL`, `OFFICE_BEARER`, `FACILITY` or
   `SPORT`.
2. **Preview (dry run).** `POST /institution/imports` with multipart `file` (`.csv` UTF-8 or `.xlsx`, ≤ 5 MB, ≤ 5000 rows),
   `kind`, `mode` (`CREATE_ONLY` by default, or `UPSERT`) and an optional batch-level `sourceUrl` / `sourceDocument`. Every
   row is validated and normalised (whitespace, case, Unicode NFKC, honorifics ignored for duplicate detection) and
   classified as `CREATE`, `UPDATE`, `UNCHANGED`, `SKIP` or `ERROR`. Duplicates are detected both within the file and
   against the database. **Nothing is written** except the batch record.
3. **Commit.** `POST /institution/imports/:id/commit` applies the preview in one transaction under an advisory lock. If
   any target record changed after the preview, the whole commit aborts with the conflicting rows listed. Batches with
   errors need `allowErrors: true`, in which case only the valid rows are imported. `CREATE_ONLY` never overwrites. Previews
   expire after 24 hours.
4. **Rollback.** `POST /institution/imports/:id/rollback` deletes the records the batch created and restores the previous
   values of those it updated. If any of them was edited after the import, the rollback refuses as a whole, so an import
   can't silently undo a later correction.
5. **Verification.** `PATCH /institution/records/:id/status` lets an administrator mark a record `VERIFIED`, which
   requires a source, as well as `EXPIRED` and so on. Every step is written to the hash-chained audit ledger.

### Columns

| Kind | Required | Optional |
|---|---|---|
| `PERSONNEL` | `name`, `designation` | `department`, `email`, `phone`, `sport`, `role_hint` |
| `OFFICE_BEARER` | `name`, `position` | `hostel`, `sport`, `email`, `role_hint` |
| `FACILITY` | `name` | `type`, `sports`, `location`, `capacity`, `notes` |
| `SPORT` | `name` | `category`, `description` |
| All kinds | | `source_url`, `source_document`, `verified_on` (YYYY-MM-DD), `valid_until`, `status` |

`role_hint` must be a SportsOS role name such as `COACH`. It is a hint only and grants nothing.

## How to load the official data (steps for an authorised administrator)

1. Allow `www.iitism.ac.in` and `people.iitism.ac.in` in the deployment's network policy, or work from a machine that can
   reach them.
2. Open each official page and copy only what it publishes (names, designations, official contact details) into the
   template. Put the page URL in `source_url` and the date you checked in `verified_on`. Do not add anything the page
   doesn't say.
3. For student office-bearers, use only an authorised roster issued by DSW / the Gymkhana. Cite it in `source_document`
   and set `valid_until` to the end of the tenure.
4. Preview, review every row, then commit. Spot-check the Directory.
5. For bookable facilities, an officer creates or edits `Facility` records only after a field survey of coordinates,
   geofence radius and opening hours. Public pages don't supply these. The demo facilities' coordinates are placeholders.

## What still needs institutional authorisation

* A current, authorised roster of student office-bearers (General Secretary, Sports Council, hostel secretaries,
  sport coordinators, Event Committee, media nominees).
* Confirmation of the official facility list, opening hours and surveyed GPS coordinates.
* The official hostel list. The web client's `HOSTELS` suggestion list predates this work and is marked
  **unverified** in `apps/web/lib/constants.ts`.
* Any budget or expenditure data. SportsOS holds none, and the Dean dashboard says so rather than showing numbers.
* A decision on whether SportsOS may use institutional SSO or email verification. Self-registration currently only checks
  the `@iitism.ac.in` domain.

No authenticated institutional portal was accessed, and no access restriction was bypassed.
