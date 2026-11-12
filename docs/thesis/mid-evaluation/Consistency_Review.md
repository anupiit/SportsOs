# Final Consistency Review — Mid-Evaluation Report vs. Approved Proposal

Mid-evaluation, 13 November 2026 · Anup Kumar (22JE0143)

This review compares the mid-evaluation report with:

- the proposal report (11 Aug 2026);
- the proposal presentation;
- the implemented repository.

Section 6 is a checklist for the mid-evaluation PPT, so that the slides and the report say the same thing.

## 1. Title, student and mentor details

| Item | Proposal | Mid-evaluation report | Consistent? |
|---|---|---|---|
| Title | SportsOS: An AI-Powered Sports ERP for IIT (ISM) Dhanbad | Same | ✅ |
| Student / admission no. / mentor | Anup Kumar, 22JE0143, Prof. Scindhiya Laxmi | Same | ✅ |
| Department | Mathematics and Computing | Same; programme stated as Integrated M.Tech | ✅ |

## 2. Research objectives

The six objectives (O1–O6) are reproduced **unchanged** (report Table 1.1) and assessed in Table 7.1:

| Objective | Assessment |
|---|---|
| O1 Centralise operations | Met (prototype) |
| O2 Automate administration | Met (prototype) |
| O3 RBAC | Met (prototype) |
| O4 Analytics | Partly met: synthetic data only |
| O5 Student experience | Partly met: no user study; mobile not device-tested |
| O6 Scalable, future-ready | Partly met: no cloud deployment, load test, live AI or shared cache |

No objective was added, removed or reworded. ✅

## 3. Scope and stakeholder model

| Proposal statement | Current state | Action |
|---|---|---|
| "RBAC securing customised views for 15+ distinct user types" | 18 roles (17 organisational + System Administrator) | Consistent. Use **18 roles** in the PPT. |
| Stakeholder hierarchy (Director → Dean SW → President SPEC → PESO / GSec / Event Committee …) | Implemented as the organisation chart (`reportsTo`), but **not** used to grant permissions | The report labels this hierarchy as the author's requirements model, not an official chart. Keep the same wording on slides. |
| "Sports and Physical Education **Cell** (SPEC)" | SPEC's own pages say "Sports & Physical Education **Center**" | The report uses "Center". **Update the PPT.** |
| Payments, SSO, central ERP integration | Not in proposal scope; listed as out of scope | ✅ |

## 4. Technology stack

| Layer | Proposal | Implemented (verified version) | Consistent? |
|---|---|---|---|
| Web | Next.js 15 | Next.js 15.5.28, React 19.1.10 | ✅ |
| Mobile | React Native with Expo | Expo SDK 54, React Native 0.81.5 | ✅ (type-checked only) |
| API | NestJS + TypeScript | NestJS 11.2.7, TypeScript 5.9.3 | ✅ |
| LLM | "OpenAI/Claude API" | Claude via `@anthropic-ai/sdk` only, optional; offline fallback | ⚠️ Say "Claude (optional; verified in offline mode only)". Do not claim OpenAI. |
| Vector DB | Pinecone | Pinecone optional; in-process BM25 used when no key is set | ⚠️ Say Pinecone is "supported, not yet exercised live" |
| Database / ORM | PostgreSQL + Prisma | PostgreSQL 16 + Prisma 6.19.3 | ✅ |
| Infrastructure | AWS + Docker + Vercel | Docker Compose configured (not executed in evaluation); AWS/Vercel not started | ⚠️ Show AWS/Vercel as **planned** |
| Caching | "cache optimisation" (Mar–Apr) | No Redis; in-process caches only | ⚠️ Show as **planned** |

## 5. Claims that must be softened (proposal → report wording)

| Proposal claim | Why it cannot be claimed now | Wording used in the report |
|---|---|---|
| "OTP validation and precise GPS geofencing **eliminates** proxy check-ins" | A rooted phone spoofing GPS inside the room can still pass, and field GPS behaviour is untested | "raises the bar against proxy attendance and detects device reuse"; field validation planned |
| "Sub-second static web delivery" (Next.js) | No performance measurement was made | Not claimed; performance testing listed as planned (NFR-08) |
| "AI Analytics Suite for voice-assisted reporting, stock alerts and demand forecasting" | Stock alerts are rule-based. Forecasting is statistical (Holt–Winters), not AI. Voice input exists in code but is untested. The LLM was verified only offline. | Each item is reported under its true category: rules, statistics, or optional LLM |
| "AI-driven forecasting … replacing intuition with reliable statistics" | Forecast runs on synthetic data only | "executes on synthetic history; accuracy on real data is planned work" |
| Repository README marks the Jan 2027 (AI) and Feb 2027 (mobile) milestones as "Done" | Neither was verified live or on a device | Report marks both **Partial**. **Recommend updating the README** to match. |

## 6. Roadmap alignment

| Proposal milestone | Report status |
|---|---|
| Aug 2026 — SRS, wireframes | Done (requirements in report Ch. 3) |
| Sep 2026 — Database & authentication | Done |
| Oct 2026 — Club rosters, GPS/OTP attendance | Done |
| Nov 2026 — Asset & inventory, booking grids, stock alerts | Done |
| Dec 2026 — Council hub & tournament brackets | Done early |
| Jan 2027 — AI integration (Pinecone), executive dashboards | Partial (dashboards done; AI offline only) |
| Feb 2027 — React Native client with QR | Partial (implemented, type-checked; not device-tested) |
| Mar–Apr 2027 — Hardening, final demo | Planned (re-scoped in report §7.8 and Figure 7.1) |

## 7. PPT checklist (keep the slides identical to the report)

Use these exact figures and labels on the mid-evaluation slides.

**Verification results (12 Nov 2026)**

| Check | Result |
|---|---|
| Unit tests | 71 / 71 |
| API smoke checks | 83 / 83 |
| RBAC and workflow e2e checks | 200 / 200 |
| Browser per-role checks | 9 / 9 |
| Browser flow checks | 12 / 12 |
| Demo logins | 19 / 19 |
| TypeScript / ESLint | 0 errors (2 ESLint warnings) |

**Scale**

- 31 Prisma models, 32 enums, 2 migrations
- 143 API route handlers in 20 modules
- 28 web routes, 11 mobile screens
- 18 roles, 70 permissions, 346 default grants

**Status vocabulary:** use Implemented / Tested / Partial / Planned only, matching report Table 5.2.

**Limitations slide:** L-01 to L-12 from report Table 7.2. At minimum include:

- no password reset;
- no Redis;
- JWT in localStorage;
- 10 dependency advisories;
- mobile not device-tested;
- AI verified offline only;
- synthetic data;
- no load or penetration tests.

**Data disclaimer:** every dashboard screenshot shows **synthetic demo data**. Say so on the slide.

**Diagrams:** reuse the PNGs in [`figures/`](figures/) so the slides match the report:

- architecture: `f_architecture`
- ERD: `f_erd`
- RBAC: `f_rbac`
- attendance workflow: `f_attendance`
- roadmap: `f_roadmap`

**Institutional facts:** limit them to what the report cites from the SPEC pages (facilities list; Annual Sports Meet;
Inter-Hostel General Championship). Do not name coaches or staff.

## 8. Items to resolve before final submission

1. Re-open www.iitism.ac.in/spec and www.iitism.ac.in/facilities-dsw from an institute network and confirm the SPEC facts
   (they were unreachable from the evaluation sandbox).
2. Validate the stakeholder hierarchy and roles with SPEC.
3. Read the full texts of [6], [7] and [11] and extend the literature review where they support it.
4. Confirm the departmental page limit. The body is currently 48 pages (≈12,100 words), against the brief's
   approximate 20–25.
