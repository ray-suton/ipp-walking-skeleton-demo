import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('index.html loads the demo from local files only (no CDN, no network calls)', async () => {
  const html = await read('index.html');
  const external = [...html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/g)];
  assert.deepEqual(external, [], 'the demo must work offline');
  assert.match(html, /<script src="src\/store\.js"><\/script>\s*<script src="src\/app\.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="styles\.css"/);
});

test('the persistent banner discloses simulated roles, synthetic data and browser-local storage', async () => {
  const html = await read('index.html');
  assert.match(html, /Role switching and HR authorization are\s*<strong>simulated<\/strong>/);
  assert.match(html, /synthetic/);
  assert.match(html, /stored only in this browser/);
  assert.match(html, /not shared across users or\s*devices/);
  for (const deferred of ['Real authentication', 'Shared central storage', 'Eligibility verification', 'placement decisions']) {
    assert.ok(html.includes(deferred), `deferred item missing: ${deferred}`);
  }
});

test('reset and apply flows use confirmation dialogs with a safe default', async () => {
  const html = await read('index.html');
  assert.match(html, /<dialog id="reset-dialog"/);
  assert.match(html, /id="reset-cancel" autofocus/, 'destructive reset must default to Cancel');
  assert.match(html, /<dialog id="apply-dialog"/);
  assert.match(html, /does <strong>not<\/strong> approve a placement/);
});

test('app code never injects user text as HTML', async () => {
  const app = await read('src/app.js');
  assert.doesNotMatch(app, /\.innerHTML\s*=/);
  assert.doesNotMatch(app, /insertAdjacentHTML|document\.write|eval\(/);
});

test('every role from the Lab 3 brief has a view, and the demo opens on Student', async () => {
  const app = await read('src/app.js');
  for (const label of ['Employer HR', 'University Administrator', 'Student', 'Faculty Reviewer']) {
    assert.ok(app.includes(`label: '${label}'`), `missing role ${label}`);
  }
  assert.match(app, /VIEWS = \{ student: studentView, employer: employerView, admin: adminView, faculty: facultyView \}/);
  assert.match(app, /role: 'student'/);
});

test('statuses stay separate: no view can show an application as placed', async () => {
  const app = await read('src/app.js');
  assert.match(app, /PLACEMENT_STATUS/, 'views read the shared constant');
  assert.doesNotMatch(app.replaceAll('Not placed', ''), /\bplaced\b/i, 'the only "placed" wording allowed is "Not placed"');
});

test('the static server only exposes demo files, not the course documents beside them', async () => {
  const server = await read('scripts/serve.mjs');
  assert.doesNotMatch(server, /\.docx|\.png/);
  assert.match(server, /ALLOWED/);
});
