import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/store.js';

const { createStore, OPPORTUNITY_STATUS, PLACEMENT_STATUS, STORAGE_KEY } = globalThis.IPPStore;

const VALID = {
  organization_name: 'Harbor Robotics',
  title: 'Controls Intern',
  description: 'Help test motion-control firmware on a lab rig.',
  location: 'Abu Dhabi',
  work_mode: 'On-site',
  duration: '8 weeks',
};

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    raw: data,
  };
}

const fresh = () => createStore(memoryStorage());

// ---- Seed data (Lab 3 Appendix 3) ----

test('seed: two approved opportunities and one eligible student, no applications', () => {
  const store = fresh();
  const approved = store.listOpportunities({ status: OPPORTUNITY_STATUS.APPROVED });
  assert.deepEqual(
    approved.map((o) => `${o.title} @ ${o.organization_name}`),
    ['Product Design Intern @ Evergreen Labs', 'Data Analytics Intern @ Northstar Analytics'],
  );
  assert.deepEqual(store.getStudent('STU-001'), { student_id: 'STU-001', display_name: 'Alex Lee', eligibility_status: 'Eligible' });
  assert.equal(store.listFacultyRecords().length, 0);
});

// ---- Employer HR: IPP-01, IPP-02, IPP-03 ----

test('IPP-01 valid submission gets a unique ID and starts as Pending Review', () => {
  const store = fresh();
  const first = store.submitOpportunity(VALID, { hrAuthorized: true });
  const second = store.submitOpportunity({ ...VALID, title: 'Second role' }, { hrAuthorized: true });
  assert.equal(first.ok, true);
  assert.equal(first.opportunity.approval_status, 'Pending Review');
  assert.equal(first.opportunity.opportunity_id, 'OPP-003');
  assert.equal(second.opportunity.opportunity_id, 'OPP-004');
  assert.equal(store.counts().pending, 2);
});

test('IPP-01 reuses the employer record for a known organization and creates one for a new one', () => {
  const store = fresh();
  const known = store.submitOpportunity({ ...VALID, organization_name: '  evergreen LABS ' }, { hrAuthorized: true });
  assert.equal(known.opportunity.employer_id, 'EMP-001');
  const created = store.submitOpportunity(VALID, { hrAuthorized: true });
  assert.equal(created.opportunity.employer_id, 'EMP-003');
});

test('IPP-01 error: blank and whitespace-only required fields are rejected, nothing is created', () => {
  const store = fresh();
  const result = store.submitOpportunity(
    { ...VALID, organization_name: '', title: '   ', description: '\n\t', location: ' ' },
    { hrAuthorized: true },
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'validation');
  assert.deepEqual(Object.keys(result.errors).sort(), ['description', 'location', 'organization_name', 'title']);
  assert.equal(store.listOpportunities().length, 2);
});

test('IPP-01 error: over-long values are rejected', () => {
  const store = fresh();
  const result = store.submitOpportunity({ ...VALID, title: 'x'.repeat(101) }, { hrAuthorized: true });
  assert.equal(result.ok, false);
  assert.match(result.errors.title, /100 characters or fewer/);
});

test('IPP-02 error: submission without simulated HR authorization is blocked', () => {
  const store = fresh();
  const result = store.submitOpportunity(VALID, { hrAuthorized: false });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unauthorized');
  assert.match(result.message, /deferred/);
  assert.equal(store.listOpportunities().length, 2);
  assert.equal(store.submitOpportunity(VALID).ok, false, 'missing options must not authorize');
});

// ---- Administrator: IPP-04, IPP-05 ----

test('IPP-05 approval updates the same record and removes it from the pending queue', () => {
  const store = fresh();
  const { opportunity } = store.submitOpportunity(VALID, { hrAuthorized: true });
  assert.deepEqual(store.listOpportunities({ status: OPPORTUNITY_STATUS.PENDING }).map((o) => o.opportunity_id), [opportunity.opportunity_id]);

  const approved = store.approveOpportunity(opportunity.opportunity_id);
  assert.equal(approved.ok, true);
  assert.equal(approved.opportunity.opportunity_id, opportunity.opportunity_id);
  assert.equal(store.listOpportunities({ status: OPPORTUNITY_STATUS.PENDING }).length, 0, 'empty queue');
  assert.ok(store.searchApproved('').some((o) => o.opportunity_id === opportunity.opportunity_id));
});

test('IPP-05 error: unknown and already-approved opportunities cannot be approved', () => {
  const store = fresh();
  assert.equal(store.approveOpportunity('OPP-999').code, 'not_found');
  assert.equal(store.approveOpportunity('OPP-001').code, 'already_approved');
});

// ---- Student: IPP-06 to IPP-10 ----

test('IPP-06 students never see Pending Review opportunities', () => {
  const store = fresh();
  store.submitOpportunity(VALID, { hrAuthorized: true });
  assert.equal(store.searchApproved('').length, 2);
  assert.equal(store.searchApproved('harbor').length, 0);
});

test('IPP-06 search matches title or organization, case-insensitively, and can return nothing', () => {
  const store = fresh();
  assert.deepEqual(store.searchApproved('DATA').map((o) => o.opportunity_id), ['OPP-002']);
  assert.deepEqual(store.searchApproved('evergreen').map((o) => o.opportunity_id), ['OPP-001']);
  assert.deepEqual(store.searchApproved('  intern ').map((o) => o.opportunity_id), ['OPP-001', 'OPP-002']);
  assert.deepEqual(store.searchApproved('zzz'), []);
});

test('IPP-07 application links student and opportunity, starts Submitted and gets a review record', () => {
  const store = fresh();
  const result = store.submitApplication('STU-001', 'OPP-001');
  assert.equal(result.ok, true);
  assert.equal(result.application.application_id, 'APP-001');
  assert.equal(result.application.application_status, 'Submitted');
  assert.equal(result.application.opportunity_id, 'OPP-001');
  assert.equal(result.application.student_id, 'STU-001');
  assert.ok(!Number.isNaN(Date.parse(result.application.submitted_at)));
  assert.equal(result.review.review_id, 'REV-001');
  assert.equal(result.review.application_id, 'APP-001');
  assert.equal(result.review.review_status, 'Not started');
});

test('IPP-08 error: duplicate application is blocked and creates nothing', () => {
  const store = fresh();
  store.submitApplication('STU-001', 'OPP-001');
  const again = store.submitApplication('STU-001', 'OPP-001');
  assert.equal(again.ok, false);
  assert.equal(again.code, 'duplicate');
  assert.equal(store.listStudentApplications('STU-001').length, 1);
  assert.equal(store.listFacultyRecords().length, 1);
  assert.equal(store.hasApplied('STU-001', 'OPP-001'), true);
  assert.equal(store.hasApplied('STU-001', 'OPP-002'), false);
});

test('IPP-07 error: pending, unknown opportunity or unknown student cannot receive an application', () => {
  const store = fresh();
  const { opportunity } = store.submitOpportunity(VALID, { hrAuthorized: true });
  assert.equal(store.submitApplication('STU-001', opportunity.opportunity_id).code, 'not_approved');
  assert.equal(store.submitApplication('STU-001', 'OPP-999').code, 'not_found');
  assert.equal(store.submitApplication('STU-999', 'OPP-001').code, 'not_found');
  assert.equal(store.listFacultyRecords().length, 0);
});

test('IPP-09 my applications show linked opportunity and a separate "Not placed" placement status', () => {
  const store = fresh();
  store.submitApplication('STU-001', 'OPP-002');
  const [mine] = store.listStudentApplications('STU-001');
  assert.equal(mine.application_id, 'APP-001');
  assert.equal(mine.opportunity.title, 'Data Analytics Intern');
  assert.equal(mine.opportunity.organization_name, 'Northstar Analytics');
  assert.equal(mine.application_status, 'Submitted');
  assert.equal(mine.placement_status, PLACEMENT_STATUS);
  assert.equal(PLACEMENT_STATUS, 'Not placed');
});

test('IPP-10 display name: nonblank saves (trimmed); blank or over-long is rejected; ID and eligibility are untouched', () => {
  const store = fresh();
  const saved = store.updateDisplayName('STU-001', '  Alexandra Lee ');
  assert.equal(saved.ok, true);
  assert.equal(store.getStudent('STU-001').display_name, 'Alexandra Lee');
  assert.equal(store.getStudent('STU-001').eligibility_status, 'Eligible');

  const blank = store.updateDisplayName('STU-001', '   ');
  assert.equal(blank.ok, false);
  assert.match(blank.errors.display_name, /required/);
  assert.equal(store.updateDisplayName('STU-001', 'x'.repeat(61)).ok, false);
  assert.equal(store.getStudent('STU-001').display_name, 'Alexandra Lee');
});

// ---- Faculty: IPP-11, IPP-12 ----

test('IPP-11/12 faculty records join the same IDs and keep application and placement status separate', () => {
  const store = fresh();
  store.submitApplication('STU-001', 'OPP-001');
  const [record] = store.listFacultyRecords();
  assert.equal(record.application.application_id, 'APP-001');
  assert.equal(record.student.student_id, 'STU-001');
  assert.equal(record.opportunity.opportunity_id, 'OPP-001');
  assert.equal(record.opportunity.organization_name, 'Evergreen Labs');
  assert.equal(record.review.review_id, 'REV-001');
  assert.equal(record.review.faculty_id, 'FAC-001');
  assert.equal(record.application.application_status, 'Submitted');
  assert.equal(record.placement_status, 'Not placed');
});

test('faculty view reflects a later display-name change on the same student record', () => {
  const store = fresh();
  store.submitApplication('STU-001', 'OPP-001');
  store.updateDisplayName('STU-001', 'Alex L.');
  assert.equal(store.listFacultyRecords()[0].student.display_name, 'Alex L.');
});

test('read helpers return copies: mutating a result does not change shared records', () => {
  const store = fresh();
  store.searchApproved('')[0].approval_status = 'Pending Review';
  store.getStudent('STU-001').display_name = 'Hacked';
  assert.equal(store.searchApproved('').length, 2);
  assert.equal(store.getStudent('STU-001').display_name, 'Alex Lee');
});

// ---- Persistence and reset: IPP-14, IPP-15 ----

test('IPP-14 records persist: a new store on the same storage sees them', () => {
  const storage = memoryStorage();
  const first = createStore(storage);
  first.submitOpportunity(VALID, { hrAuthorized: true });
  first.approveOpportunity('OPP-003');
  first.submitApplication('STU-001', 'OPP-003');

  const reloaded = createStore(storage);
  assert.equal(reloaded.listOpportunities().length, 3);
  assert.equal(reloaded.listStudentApplications('STU-001')[0].opportunity.opportunity_id, 'OPP-003');
  assert.equal(reloaded.isPersistent(), true);
});

test('IPP-14 corrupted or foreign storage falls back to the seed instead of crashing', () => {
  for (const raw of ['not json', '{"version":99}', '[]', 'null', '{"version":1,"employers":1}']) {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, raw);
    const store = createStore(storage);
    assert.equal(store.listOpportunities().length, 2, `fallback for ${raw}`);
  }
});

test('IPP-14 works without storage (blocked by the browser) and reports it', () => {
  const store = createStore(null);
  store.submitOpportunity(VALID, { hrAuthorized: true });
  assert.equal(store.listOpportunities().length, 3);
  assert.equal(store.isPersistent(), false);
});

test('IPP-14 a throwing storage (quota) keeps the in-memory records and flags non-persistence', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  storage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.equal(store.submitOpportunity(VALID, { hrAuthorized: true }).ok, true);
  assert.equal(store.listOpportunities().length, 3);
  assert.equal(store.isPersistent(), false);
});

test('IPP-15 reset restores the sample opportunities and clears submissions and applications', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.submitOpportunity(VALID, { hrAuthorized: true });
  store.approveOpportunity('OPP-003');
  store.submitApplication('STU-001', 'OPP-003');
  store.updateDisplayName('STU-001', 'Someone Else');

  store.reset();
  assert.deepEqual(store.listOpportunities().map((o) => o.opportunity_id), ['OPP-001', 'OPP-002']);
  assert.equal(store.listFacultyRecords().length, 0);
  assert.equal(store.getStudent('STU-001').display_name, 'Alex Lee');
  assert.equal(createStore(storage).listOpportunities().length, 2, 'reset is persisted');
  // IDs restart so every demo run looks the same.
  assert.equal(store.submitOpportunity(VALID, { hrAuthorized: true }).opportunity.opportunity_id, 'OPP-003');
});

test('subscribers are notified on change and can unsubscribe; refresh picks up another tab\'s write', () => {
  const storage = memoryStorage();
  const a = createStore(storage);
  const b = createStore(storage);
  let calls = 0;
  const off = a.subscribe(() => (calls += 1));
  a.submitOpportunity(VALID, { hrAuthorized: true });
  assert.equal(calls, 1);
  assert.equal(b.listOpportunities().length, 2, 'b has not refreshed yet');
  b.refresh();
  assert.equal(b.listOpportunities().length, 3);
  a.refresh();
  assert.equal(calls, 2);
  off();
  a.reset();
  assert.equal(calls, 2);
});

// ---- IPP-16 integrated acceptance flow (Lab 3, "Final prompt") ----

test('IPP-16 one new record travels Employer -> Admin -> Student -> Faculty with consistent IDs', () => {
  const storage = memoryStorage();
  const store = createStore(storage);

  // 1. Employer HR submits; starts Pending Review.
  const submitted = store.submitOpportunity(VALID, { hrAuthorized: true });
  const oppId = submitted.opportunity.opportunity_id;
  assert.equal(submitted.opportunity.approval_status, 'Pending Review');

  // 2. Students cannot see it yet.
  assert.equal(store.searchApproved('harbor').length, 0);

  // 3. Administrator approves that same record.
  assert.equal(store.listOpportunities({ status: 'Pending Review' })[0].opportunity_id, oppId);
  assert.equal(store.approveOpportunity(oppId).ok, true);

  // 4. Student finds it and applies.
  const [found] = store.searchApproved('harbor');
  assert.equal(found.opportunity_id, oppId);
  const applied = store.submitApplication('STU-001', found.opportunity_id);
  assert.equal(applied.ok, true);

  // 5. A duplicate is prevented.
  assert.equal(store.submitApplication('STU-001', oppId).code, 'duplicate');

  // 6. Faculty sees the same application with linked IDs; Submitted vs Not placed.
  const [record] = createStore(storage).listFacultyRecords(); // survives a "reload"
  assert.equal(record.opportunity.opportunity_id, oppId);
  assert.equal(record.application.application_id, applied.application.application_id);
  assert.equal(record.student.student_id, 'STU-001');
  assert.equal(record.application.application_status, 'Submitted');
  assert.equal(record.placement_status, 'Not placed');

  // 7. Employer HR view reflects the approval on the same record.
  assert.equal(store.listOpportunities().find((o) => o.opportunity_id === oppId).approval_status, 'Approved');
});

// ---- Activity feed, journey tracker, filter/sort (professional redesign) ----

test('activity feed records each hand-off, newest first, with the acting role', () => {
  const store = fresh();
  store.reset();
  const { opportunity } = store.submitOpportunity(VALID, { hrAuthorized: true });
  store.approveOpportunity(opportunity.opportunity_id);
  store.submitApplication('STU-001', opportunity.opportunity_id);
  store.updateDisplayName('STU-001', 'Alexandra Lee');

  const feed = store.listActivity();
  assert.deepEqual(
    feed.map((entry) => entry.kind),
    ['profile_updated', 'application_submitted', 'opportunity_approved', 'opportunity_submitted', 'demo_reset'],
  );
  assert.deepEqual(feed.map((entry) => entry.role), ['student', 'student', 'admin', 'employer', 'system']);
  assert.match(feed[1].text, /Alex Lee applied to “Controls Intern”/);
  assert.equal(feed[1].ref, 'APP-001');
  assert.equal(new Set(feed.map((entry) => entry.activity_id)).size, feed.length, 'activity IDs are unique');
  assert.ok(feed.every((entry) => !Number.isNaN(Date.parse(entry.at))));
  assert.equal(store.listActivity(2).length, 2, 'limit is honoured');
});

test('activity feed ignores failed actions and unchanged display names', () => {
  const store = fresh();
  store.submitOpportunity({ ...VALID, title: '' }, { hrAuthorized: true });
  store.submitOpportunity(VALID, { hrAuthorized: false });
  store.approveOpportunity('OPP-001'); // already approved
  store.submitApplication('STU-001', 'OPP-999');
  store.updateDisplayName('STU-001', 'Alex Lee'); // same name
  assert.equal(store.listActivity().length, 0);
});

test('activity feed is capped so browser storage cannot grow without bound', () => {
  const store = fresh();
  for (let i = 0; i < 80; i += 1) store.submitOpportunity({ ...VALID, title: `Role ${i}` }, { hrAuthorized: true });
  assert.equal(store.listActivity().length, 60);
  assert.match(store.listActivity()[0].text, /Role 79/);
});

test('records saved before the activity feed existed still load', () => {
  const storage = memoryStorage();
  const legacy = JSON.parse(JSON.stringify(globalThis.IPPStore.seedState()));
  delete legacy.activity;
  storage.setItem(STORAGE_KEY, JSON.stringify(legacy));
  const store = createStore(storage);
  assert.equal(store.listOpportunities().length, 2);
  assert.deepEqual(store.listActivity(), []);
  store.submitOpportunity(VALID, { hrAuthorized: true });
  assert.equal(store.listActivity().length, 1);
});

test('journey: starts empty and advances one hand-off at a time while placement stays Not placed', () => {
  const store = fresh();
  let journey = store.getJourney();
  assert.equal(journey.opportunity, null);
  assert.deepEqual(journey.stages.map((s) => s.done), [false, false, false, false]);
  assert.equal(journey.complete, false);

  const { opportunity } = store.submitOpportunity(VALID, { hrAuthorized: true });
  journey = store.getJourney();
  assert.equal(journey.opportunity.opportunity_id, opportunity.opportunity_id);
  assert.equal(journey.opportunity.organization_name, 'Harbor Robotics');
  assert.deepEqual(journey.stages.map((s) => s.done), [true, false, false, false]);

  store.approveOpportunity(opportunity.opportunity_id);
  assert.deepEqual(store.getJourney().stages.map((s) => s.done), [true, true, false, false]);

  store.submitApplication('STU-001', opportunity.opportunity_id);
  journey = store.getJourney();
  assert.deepEqual(journey.stages.map((s) => s.done), [true, true, true, true]);
  assert.equal(journey.complete, true);
  assert.equal(journey.application.application_status, 'Submitted');
  assert.equal(journey.placement_status, 'Not placed');
  assert.deepEqual(journey.stages.map((s) => s.role), ['employer', 'admin', 'student', 'faculty']);
});

test('journey tracks the latest submitted record and ignores sample records', () => {
  const store = fresh();
  store.submitApplication('STU-001', 'OPP-001'); // sample record: must not count as a demo journey
  assert.equal(store.getJourney().opportunity, null);
  store.submitOpportunity(VALID, { hrAuthorized: true });
  const second = store.submitOpportunity({ ...VALID, title: 'Second role' }, { hrAuthorized: true });
  assert.equal(store.getJourney().opportunity.opportunity_id, second.opportunity.opportunity_id);
});

test('searchApproved filters by work mode and sorts newest-first or by title', () => {
  const store = fresh();
  const remote = store.submitOpportunity({ ...VALID, title: 'Alpha Remote Role', work_mode: 'Remote' }, { hrAuthorized: true });
  store.approveOpportunity(remote.opportunity.opportunity_id);

  assert.deepEqual(store.searchApproved('', { workMode: 'Remote' }).map((o) => o.opportunity_id), ['OPP-003']);
  assert.deepEqual(store.searchApproved('', { workMode: 'Hybrid' }).map((o) => o.opportunity_id), ['OPP-001']);
  assert.equal(store.searchApproved('', { workMode: 'All' }).length, 3, '"All" means no filter');
  assert.equal(store.searchApproved('', { workMode: 'bogus' }).length, 3, 'unknown modes are ignored');
  assert.deepEqual(store.searchApproved('', { sort: 'newest' }).map((o) => o.opportunity_id), ['OPP-003', 'OPP-002', 'OPP-001']);
  assert.deepEqual(store.searchApproved('', { sort: 'title' }).map((o) => o.title), ['Alpha Remote Role', 'Data Analytics Intern', 'Product Design Intern']);
  assert.deepEqual(store.searchApproved('intern', { workMode: 'On-site', sort: 'title' }).map((o) => o.opportunity_id), ['OPP-002']);
  assert.deepEqual(store.searchApproved('').map((o) => o.opportunity_id), ['OPP-001', 'OPP-002', 'OPP-003'], 'default order unchanged');
});

test('student applications include the linked review record; faculty reviewer is exposed read-only', () => {
  const store = fresh();
  store.submitApplication('STU-001', 'OPP-002');
  const [mine] = store.listStudentApplications('STU-001');
  assert.equal(mine.review.review_id, 'REV-001');
  assert.equal(mine.review.review_status, 'Not started');
  assert.equal(store.getFaculty().faculty_id, 'FAC-001');
  store.getFaculty().display_name = 'Hacked';
  assert.equal(store.getFaculty().display_name, 'Dr. Sam Okafor');
});
