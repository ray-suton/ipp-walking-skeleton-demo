# IPP walking skeleton demo

Live demo: <https://ray-suton.github.io/ipp-walking-skeleton-demo/>

A small, dependency-free prototype of an **Internship Practicum Platform (IPP)**: four role views over one shared set of synthetic records.

1. **Employer HR** submits an internship opportunity (starts as *Pending Review*).
2. **University Administrator** reviews and approves it.
3. **Student** finds the approved opportunity and applies (duplicates are blocked).
4. **Faculty Reviewer** sees the same application, read-only. *Submitted* (application) and *Not placed* (placement) are always shown separately.

## Please read: what is real and what is not

- **Simulated:** role switching (there is no login) and the "authorized HR" checkbox. They exist only to demonstrate the flow and are not access control.
- **Browser-local:** all records are synthetic and live in your browser's `localStorage`. Nothing is sent to a server, and nothing is shared between users or devices.
- **Deferred:** real authentication and permissions, central storage, eligibility verification, review decisions and placement decisions.

Use **Reset demo data** in the banner to return to the starting state.

## Run locally

```bash
npm start     # http://127.0.0.1:4173/
npm test      # business rules, persistence and static contract tests
```

No build step and no dependencies; plain HTML, CSS and JavaScript. See [PROJECT_DESCRIPTION.md](PROJECT_DESCRIPTION.md) for the demo script, file map and data model, [feature-list.json](feature-list.json) for per-feature verification, and [PROGRESS.md](PROGRESS.md) for status and known limits.
