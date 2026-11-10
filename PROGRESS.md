# Progress

Authoritative planning lives in the course's Lab 3 – Sprint 1 walking-skeleton brief (backlog IPP-01…22; a course handout, not included in this repository). This file only records what has been done and what is next.

## Current phase

Sprint 1: walking skeleton demo. Local standalone implementation is complete and verified; the shared Lovable/GitHub build is a separate class activity.

## 2026-11-10: Employer HR can view applications (published to GitHub Pages)

**Work done**
- After a student applies, Employer HR now sees the applicant: new **Applicants** tab on the Employer view (name, student ID, eligibility, application/opportunity IDs, *Submitted* vs *Not placed*, submitted time), a live count on the tab, a "1 applicant · View" link under each opportunity, and a link from the student's apply confirmation (`#employer/applicants`).
- Data boundary: `listEmployerApplications()` / `applicantCounts()` in `src/store.js` give HR a narrower projection than Faculty (no review records, only the student fields needed to recognise an applicant). Tests pin this.
- Tabs generalised for Student and Employer (`#employer/submit`, `#employer/applicants`); Overview step card and the journey's final step now mention Employer HR.

**Verification**
- `npm test`: 59/59 (7 new store tests for the employer view; stamp, icon and CSS-class guards still pass).
- Scripted real-UI run in Chrome: 22 checks, 21 passed. The one miss was my own wrong expectation that the applicant card flashes when HR opens the tab (highlights play only on the render right after an action); not a product bug and not added as a feature.
- Real-key tab navigation (ArrowRight, wrap, End), deep link `#employer/applicants` after a real reload, wide two-column Employer layout (seen for the first time), and 390px layout: no horizontal overflow in 5 route states.

**State left behind**
- Pushed to `main` (3315274) and live at <https://ray-suton.github.io/ipp-walking-skeleton-demo/>. Live check on the GitHub Pages origin (page fetched fresh): 17/17 checks pass (empty state, submit, approve, apply, HR sees the applicant with Submitted / Not placed, HR sees no review or faculty IDs, "1 applicant · View" link, Faculty still sees REV-001, overview and journey wording), deep link `#employer/applicants` works after a real reload, no console errors. Browser demo data was reset afterwards.

**Known limits and risks**
- The simulated HR user is not tied to an organization, so it sees applicants for every opportunity. Shortlist/interview/offer actions, "new applicant" badges and what student data employers may see are deferred decisions.
- Not tested: real phone, Safari/Firefox, screen reader, formal contrast audit.

**Recommended next step**
Rehearse the demo script once on the presenting machine (hard-refresh first if the page was open recently). `git pull` in the Desktop `Coop/` copy to bring it up to date.

## 2026-11-09 to 2026-11-10: professional redesign (published to GitHub Pages 2026-11-10)

**Work done**
- New Overview page (default route): hero, live stat tiles, clickable journey cards, journey tracker, activity feed, working/simulated/deferred summary.
- Live right-hand rail on every role page: journey tracker (Done / Next step / Waiting) and recent activity with auto-refreshing relative times.
- Employer HR: live listing preview with description counter; layout switches by available width (container query).
- Student: work-mode filter, sort, result count, Clear filters; org logo tiles; per-application progress track.
- Visual system: custom logo and favicon, hand-drawn inline SVG icons, initials tiles/avatars, persona chip with a "Simulated" tag, breadcrumb top bar, elevated cards, entrance/highlight/bump animations (all disabled under reduced-motion), mobile bottom tab bar, footer with "not a production system" disclosure. No external fonts, libraries or network calls.
- Rules layer: activity log, journey summary, filter/sort, review linked to student applications (`src/store.js`); new `src/ui.js`.
- User actions now update UI state and then render once (removes the render-before-state-update ordering bug class).

**Verification**
- `npm test`: 49/49 (store rules incl. new features, UI helpers, contract tests). The new guards were mutation-checked: an injected CSS-class typo, icon typo, "placed" wording and `innerHTML` were each caught by the intended test.
- Scripted run of the real UI in Chrome against `npm start`: 48 checks, 0 failures (full four-role journey, live preview, filters, sort, highlights, focus handling, journey and activity updates), arrow-key tabs, reload persistence, no console errors.
- Phone layout (390px iframe): no horizontal overflow across 7 route states; fixed 5-item bottom tab bar.
- Bugs found and fixed while building: `display` rules overriding the `hidden` attribute (guarded by a CSS rule and a test); the phone reset button losing its accessible name; Employer layout too cramped beside the rail (now container-query driven).

**State left behind**
- Published: `main` is at the redesign plus the cache-busting fix; GitHub Pages serves it at <https://ray-suton.github.io/ipp-walking-skeleton-demo/>.
- Work was done in a clone at `~/ipp-demo` because macOS blocked that session from `~/Desktop`; the Desktop `Coop/` copy is a clone of the same repo and needs `git pull` to catch up.

**Known limits and risks**
- Not tested: wide-screen Employer layout (side-by-side), real phone, Safari/Firefox, screen reader, formal contrast audit, file:// open.
- Container queries need Chrome 105+ / Safari 16+ / Firefox 110+; older browsers get the single-column Employer layout.

**Release incident (found and fixed on 2026-11-10)**
- Right after the first push of the redesign, a live check failed 6 of 16 checks: the browser had received the new `index.html` with the previous `app.js` and `styles.css` (Pages and browsers cache each file for about 10 minutes), which rendered a broken page. The server itself was correct (all live files matched the pushed ones).
- Fix: asset URLs in `index.html` now carry a content hash (`app.js?v=…`), written by `npm run stamp`; `npm test` fails if the hashes are stale (mutation-checked). Re-ran the live check afterwards: 21/21 pass, records persist across reload, no console errors.
- Residual risk: a visitor holding the old `index.html` in cache can briefly pair it with newer files; this self-heals when that 10 minute cache expires.

**Recommended next step**
Rehearse the demo script in `PROJECT_DESCRIPTION.md` once on the presenting machine. After any later change to `styles.css` or `src/*.js`, run `npm run stamp` before committing. Decide whether a shared backend is needed (IPP-18); today's data is browser-local only.

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
