# Project description

## Purpose

A runnable demo of the **IPP (Internship Practicum Platform) Sprint 1 walking skeleton** from *Lab 3 – Sprint 1 – Walking skeleton*: the smallest end-to-end path across all four team responsibilities, using synthetic data only.

1. **Employer HR** submits an internship opportunity (starts as *Pending Review*).
2. **University Administrator** reviews and approves it.
3. **Student** finds the approved opportunity and applies.
4. **Faculty Reviewer** sees the same application, read-only, with *Submitted* and *Not placed* shown separately.

Project type: **development** (course prototype). The class build itself is meant to live in one shared Lovable project + one GitHub repo (`IPP – Master`); this folder is a standalone, dependency-free implementation of the same brief that can be demoed or used as a reference while that shared build is set up.

## Status

Working locally. All 16 baseline backlog stories (IPP-01 … IPP-16) are implemented and verified; see `feature-list.json` and `PROGRESS.md`. Not yet connected to any Lovable/GitHub project (no access or links were provided).

## Tech stack

Plain HTML + CSS + JavaScript (classic scripts, no build step, no dependencies). Records live in `localStorage` under the key `ipp-demo-v1`. Tests use Node's built-in runner (developed and tested on Node 25); the app itself needs only a browser.

## Run

```bash
npm start          # http://127.0.0.1:4173/ (moves to the next free port if busy)
npm test           # 32 tests: business rules, persistence, static contract
```

Opening `index.html` straight from disk should also work (the scripts are classic, not ES modules), but this was **not tested**; use `npm start` for the demo.

## Demo script (about 2 minutes)

1. Click **Reset demo data** → confirm (always start from the same state).
2. **Employer HR**: untick *Simulate an authorized HR representative* → submit is disabled. Re-tick it. Press **Fill sample data** → **Submit for review**. Status shows `OPP-003 · Pending Review`. (For the error test: clear a field or leave only spaces, then submit.)
3. **University Administrator**: `OPP-003` is in the review queue → **Approve**. Queue now shows the empty-state message.
4. **Student**: search `harbor`, **Apply** → dialog names the opportunity and applicant → **Submit application**. The card now says *Application submitted* (no second apply possible). Check **My applications**.
5. **Faculty Reviewer**: same `APP-001` / `STU-001` / `OPP-003` / `REV-001`, status *Submitted*, placement *Not placed*, no action buttons.
6. Reload the page: records persist. Use **What is working, simulated, or deferred?** to answer the "real vs simulated" question.

## Main files

| Path | Role |
| --- | --- |
| `index.html`, `styles.css` | Shell, persistent disclosure banner, dialogs, styling (green/white per Lab 3 Appendix 3) |
| `src/store.js` | All business rules and persistence: validation, ID generation, status transitions, duplicate prevention, reset. Pure, unit-tested. |
| `src/app.js` | Four role views, routing (`#employer`, `#admin`, `#student[/tab]`, `#faculty`), toasts, dialogs. Text is always set via `textContent`. |
| `scripts/serve.mjs` | Local static server with port fallback; serves only demo files. |
| `tests/` | `store.test.mjs` (rules + IPP-16 flow), `app-contract.test.mjs` (disclosure text, safe DOM use, server allowlist) |
| `feature-list.json`, `PROGRESS.md` | Feature ledger and session log |

## Data model

Follows the Lab 3 dictionary: `Employer`, `Opportunity`, `Student`, `Application`, `Faculty review`. Demo-only additions: `Opportunity.origin` (`sample` / `demo`, to label records in lists) and a `faculty` list holding one reviewer (`FAC-001`). `Placement status` is a constant (*Not placed*), not a stored field, because placement decisions are deferred (IPP-22).

## Real vs simulated vs deferred

- **Working:** shared records across all four views, validation, status changes, duplicate prevention, browser-local persistence, reset.
- **Simulated:** role switching (no login), HR authorization checkbox, a single fixed student (Alex Lee, `STU-001`) and faculty reviewer.
- **Deferred:** real authentication/permissions (IPP-17), shared central storage (IPP-18), return-for-revision (IPP-19), eligibility checks (IPP-20), review outcomes (IPP-21), placement decisions (IPP-22).

## Documentation references

The source brief is the course's *Lab 3 – Sprint 1 – Walking skeleton* handout (backlog IPP-01…22, build prompts, definition of done). It is course material and is not included in this repository.
