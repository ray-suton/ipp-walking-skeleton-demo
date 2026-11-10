# Project description

## Purpose

A runnable demo of the **IPP (Internship Practicum Platform) Sprint 1 walking skeleton** from *Lab 3 – Sprint 1 – Walking skeleton*: the smallest end-to-end path across all four team responsibilities, using synthetic data only.

1. **Employer HR** submits an internship opportunity (starts as *Pending Review*).
2. **University Administrator** reviews and approves it.
3. **Student** finds the approved opportunity and applies.
4. **Faculty Reviewer** sees the same application, read-only, with *Submitted* and *Not placed* shown separately.

Project type: **development** (course prototype). The class build itself is meant to live in one shared Lovable project + one GitHub repo (`IPP – Master`); this folder is a standalone, dependency-free implementation of the same brief that can be demoed or used as a reference while that shared build is set up.

## Status

Live at <https://ray-suton.github.io/ipp-walking-skeleton-demo/> (GitHub Pages, served from `main`; source at <https://github.com/ray-suton/ipp-walking-skeleton-demo>). All 16 baseline backlog stories (IPP-01 … IPP-16) are implemented and verified; see `feature-list.json` and `PROGRESS.md`. Not connected to the class's shared Lovable project or `ipp-master` repo (no access or links were provided).

## Tech stack

Plain HTML + CSS + JavaScript (classic scripts, no build step, no dependencies, no external fonts or CDNs; hand-drawn inline SVG icons; CSS container queries for the Employer layout). Records live in `localStorage` under the key `ipp-demo-v1`. Tests use Node's built-in runner (developed and tested on Node 25); the app itself needs only a browser.

## Run

```bash
npm start          # http://127.0.0.1:4173/ (moves to the next free port if busy)
npm test           # 59 tests: business rules, persistence, UI helpers, static contract, cache-busting
npm run stamp      # after changing styles.css or any src/*.js, BEFORE committing (see below)
```

**Release step.** GitHub Pages and browsers cache files for about 10 minutes, so right after a deploy a visitor could get the new `index.html` with old scripts. `npm run stamp` writes a content hash into each asset URL in `index.html` (`app.js?v=…`) so new HTML only requests matching files. `npm test` fails if the hashes are stale.

Opening `index.html` straight from disk should also work (the scripts are classic, not ES modules), but this was **not tested**; use `npm start` for the demo.

## Demo script (about 2 minutes)

The app opens on the **Overview** (live metrics, the four-step journey, recent activity). Every action below updates the journey tracker and activity feed immediately.

1. Click **Reset demo data** → confirm (always start from the same state), then **Start the demo**.
2. **Employer HR**: untick *Simulate an authorized HR representative* → submit is disabled. Re-tick it. Press **Fill sample data** (or type) and watch the **Live preview** update. **Submit for review**: status shows `OPP-003 · Pending Review`. (For the error test: clear a field or leave only spaces, then submit.)
3. **University Administrator**: `OPP-003` is in the review queue → **Approve**. Queue now shows the empty-state message.
4. **Student**: filter by work mode or search `harbor`, **Apply** → dialog names the opportunity and applicant → **Submit application**. The card now says *Application submitted* (no second apply possible). Check **My applications**. The confirmation links on to the Employer HR view.
5. **Employer HR → Applicants tab** (also reachable from "1 applicant · View" on the opportunity): the applicant `Alex Lee` / `STU-001` / `APP-001` for `OPP-003`, status *Submitted*, placement *Not placed*, read-only. HR sees no faculty review data.
6. **Faculty Reviewer**: same `APP-001` / `STU-001` / `OPP-003` plus the review record `REV-001`, status *Submitted*, placement *Not placed*, no action buttons.
7. Back on the **Overview**: the journey shows four completed steps, with placement still *Not placed*. Reload the page: records persist. Use **What is working, simulated, or deferred?** to answer the "real vs simulated" question.

To open on the Student view instead (as in the Lab 3 appendix reference), set `DEFAULT_ROUTE = 'student'` at the top of `src/app.js`.

## Main files

| Path | Role |
| --- | --- |
| `index.html`, `styles.css` | Shell (sidebar / mobile tab bar, top bar, disclosure banner, live rail, footer), dialogs, design system (green/white per Lab 3 Appendix 3, light theme, reduced-motion aware) |
| `src/store.js` | All business rules and persistence: validation, ID generation, status transitions, duplicate prevention, filters/sort, activity log, journey summary, reset. Pure, unit-tested. |
| `src/ui.js` | Presentation helpers: DOM builder, inline SVG icon set, org tiles/avatars, relative time. No HTML-string injection. |
| `src/app.js` | Overview + four role views, routing (`#overview`, `#employer[/tab]`, `#admin`, `#student[/tab]`, `#faculty`), journey tracker, activity feed, live preview, toasts, dialogs. |
| `scripts/serve.mjs` | Local static server with port fallback; serves only the files `index.html` references. |
| `tests/` | `store.test.mjs` (rules, activity, journey, IPP-16 flow), `ui.test.mjs` (initials, colours, time), `app-contract.test.mjs` (disclosure text, safe DOM use, icon and CSS-class integrity, server allowlist) |
| `feature-list.json`, `PROGRESS.md` | Feature ledger and session log |

## Data model

Follows the Lab 3 dictionary: `Employer`, `Opportunity`, `Student`, `Application`, `Faculty review`. Demo-only additions: `Opportunity.origin` (`sample` / `demo`, to label records in lists), a `faculty` list holding one reviewer (`FAC-001`), and an `activity` list (capped at 60 entries) that feeds the activity panel. `Placement status` is a constant (*Not placed*), not a stored field, because placement decisions are deferred (IPP-22).

## Real vs simulated vs deferred

- **Working:** shared records across all four views, validation, status changes, duplicate prevention, browser-local persistence, reset.
- **Simulated:** role switching (no login), HR authorization checkbox, a single fixed student (Alex Lee, `STU-001`) and faculty reviewer. The simulated HR user is not tied to one organization, so it sees applicants for every opportunity; per-employer scoping needs real accounts.
- **Deferred:** real authentication/permissions (IPP-17), shared central storage (IPP-18), return-for-revision (IPP-19), eligibility checks (IPP-20), review outcomes (IPP-21), placement decisions (IPP-22), employer-side decisions on applicants (shortlist, interview, offer) and what student data employers may see (privacy decision).

## Documentation references

The source brief is the course's *Lab 3 – Sprint 1 – Walking skeleton* handout (backlog IPP-01…22, build prompts, definition of done). It is course material and is not included in this repository.
