# Progress

Authoritative planning lives in the course's Lab 3 – Sprint 1 walking-skeleton brief (backlog IPP-01…22; a course handout, not included in this repository). This file only records what has been done and what is next.

## Current phase

Sprint 1: walking skeleton demo. Local standalone implementation is complete and verified; the shared Lovable/GitHub build is a separate class activity.

## 2026-11-09: hosted on GitHub Pages

- Created the public repo `ray-suton/ipp-walking-skeleton-demo` (13 allowlisted demo files only; course handouts, team documents and local reports are excluded by an allowlist `.gitignore`), pushed `main`, enabled Pages from `main` / root.
- Live URL: <https://ray-suton.github.io/ipp-walking-skeleton-demo/>
- Verified on the live origin in Chrome: scripted journey 12/12 checks pass (HR block, blank-field error, submit, approve, student search, apply with duplicate prevented, faculty linked IDs and *Not placed*), records persist across a real reload, no console errors; `plan.md` is not served (404). Demo data on that origin was reset afterwards.
- Commits use the GitHub noreply address.
- Remaining: first load is the only network use; the site works offline after that only if the browser has cached it (not tested). Share the live link only after a rehearsal on the presenting machine.

## 2026-11-09: first working demo

**Work done**
- Built the four-role IPP walking skeleton (Employer HR → Administrator → Student → Faculty) as a dependency-free static app: `index.html`, `styles.css`, `src/store.js` (rules + persistence), `src/app.js` (views), `scripts/serve.mjs`.
- Implemented all baseline stories IPP-01…IPP-16 plus the Lab 3 appendix look (white sidebar, dark-green hero, persistent simulated/browser-local banner, opens on Student view, two seeded approved opportunities, Alex Lee `STU-001`).
- Added `PROJECT_DESCRIPTION.md`, `feature-list.json`, this file, and a run report.

**Verification**
- `npm test`: 32/32 pass (25 store/rule tests including the IPP-16 integrated flow, 7 static contract tests).
- Real UI in Chrome against `npm start`: scripted run of the full journey, 32 checks, 0 failures (reset dialog, HR block, whitespace validation, approve, student cannot see pending, search + no-results, apply cancel/confirm, duplicate prevention, profile blank/save, faculty linked IDs and read-only, reload persistence). Also real keystrokes in the search box, arrow/Home/End on tabs, Escape on the dialog, no console errors, no horizontal overflow at 390px in all six views (measured in a 390px iframe).
- Bugs found and fixed during verification: form kept submitted values after a successful submit (re-render ran before the draft was cleared; same ordering issue in profile save); status chips stretched vertically; stray scrollbar on the tab bar.

**State left behind**
- Demo data in the Chrome test origin was reset to the seed; `npm start` was left running on port 4173 in this session.
- Published as its own repository with GitHub Pages (see the hosting entry below). This is a personal reference copy; the class's shared `ipp-master` repo remains the instructor-controlled home of the integrated build.

**Known limits and risks**
- Opening `index.html` from disk (file://), real phone, Safari/Firefox, a screen reader and a formal contrast audit were not tested.
- No Lovable project or GitHub repo links were provided, so nothing has been pushed or connected; the prompt log and Scrum-of-Scrums notes required by Lab 3 section 10 are not produced here.
- Our team's stories are not yet mapped to Sprint 0 R-numbers; `feature-list.json` cites backlog IDs only (R-numbers must not be invented).
- Single fixed student and faculty reviewer; everything is browser-local by design (IPP-17/18 deferred).

**Recommended next step**
Rehearse the demo script in `PROJECT_DESCRIPTION.md` once on the presenting machine (`npm start`, press **Reset demo data**). Then agree with the integrators whether this folder becomes the reference for the shared Lovable build, and fill in the R-number traceability and test-report evidence Lab 3 asks for.
