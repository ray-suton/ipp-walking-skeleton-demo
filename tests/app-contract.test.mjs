import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import('../src/ui.js'); // publishes IPPUI (pure at load time, so it works in Node)
const { ICON_NAMES } = globalThis.IPPUI;

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const SOURCES = ['src/store.js', 'src/ui.js', 'src/app.js'];

test('index.html loads the demo from local files only (no CDN, no network calls)', async () => {
  const html = await read('index.html');
  const css = await read('styles.css');
  assert.deepEqual([...html.matchAll(/<(?:script|link|img|iframe|source)\b[^>]*\b(?:src|href)="(?:https?:)?\/\/[^"]+"/g)], [], 'no external assets');
  assert.doesNotMatch(css, /@import|url\(\s*['"]?(?:https?:)?\/\//, 'stylesheet pulls nothing remote');
  assert.match(html, /<script src="src\/store\.js(?:\?v=[0-9a-f]+)?"><\/script>\s*<script src="src\/ui\.js(?:\?v=[0-9a-f]+)?"><\/script>\s*<script src="src\/app\.js(?:\?v=[0-9a-f]+)?"><\/script>/, 'scripts load in dependency order');
  assert.match(html, /<link rel="stylesheet" href="styles\.css(?:\?v=[0-9a-f]+)?"/);
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

test('the footer states this is not a production system and not tied to a real employer', async () => {
  const html = await read('index.html');
  assert.match(html, /Not a production system and not\s+affiliated with any real employer/);
});

test('reset and apply flows use confirmation dialogs with a safe default', async () => {
  const html = await read('index.html');
  assert.match(html, /<dialog id="reset-dialog"/);
  assert.match(html, /id="reset-cancel" autofocus/, 'destructive reset must default to Cancel');
  assert.match(html, /<dialog id="apply-dialog"/);
  assert.match(html, /does <strong>not<\/strong> approve a placement/);
});

test('no source file injects user text as HTML', async () => {
  for (const path of SOURCES) {
    const code = await read(path);
    assert.doesNotMatch(code, /\.(?:inner|outer)HTML\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function\(/, path);
  }
});

test('the Overview plus all four Lab 3 roles have views; the demo opens on the Overview', async () => {
  const app = await read('src/app.js');
  for (const label of ['Overview', 'Employer HR', 'University Administrator', 'Student', 'Faculty Reviewer']) {
    assert.ok(app.includes(`label: '${label}'`), `missing route ${label}`);
  }
  assert.match(app, /VIEWS = \{ overview: overviewView, student: studentView, employer: employerView, admin: adminView, faculty: facultyView \}/);
  assert.match(app, /DEFAULT_ROUTE = 'overview'/);
});

test('statuses stay separate: no view can show an application as placed', async () => {
  for (const path of ['src/app.js', 'src/ui.js']) {
    const code = await read(path);
    assert.match(await read('src/app.js'), /PLACEMENT_STATUS/, 'views read the shared constant');
    assert.doesNotMatch(code.replaceAll('Not placed', ''), /\bplaced\b/i, `${path}: the only "placed" wording allowed is "Not placed"`);
  }
});

test('the static server serves exactly what index.html needs and nothing else (no course documents)', async () => {
  const server = await read('scripts/serve.mjs');
  const html = await read('index.html');
  const needed = [...html.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"?]+)(?:\?[^"]*)?"/g)].map((match) => match[1]);
  assert.ok(needed.length >= 4, 'found the referenced files');
  for (const file of needed) assert.ok(server.includes(`'/${file}'`), `server must allow /${file}`);
  assert.doesNotMatch(server, /\.docx|\.png|\.md['"]/);
  assert.match(server, /ALLOWED/);
});

test('every icon the UI asks for exists (a typo would silently render an empty icon)', async () => {
  const app = await read('src/app.js');
  const used = new Set();
  for (const pattern of [/\bicon\(\s*'([A-Za-z]+)'/g, /\bicon:\s*'([A-Za-z]+)'/g, /emptyState\(\s*'([A-Za-z]+)'/g]) {
    for (const match of app.matchAll(pattern)) used.add(match[1]);
  }
  const activityMap = /ACTIVITY_ICON = \{([^}]+)\}/.exec(app);
  for (const match of (activityMap ? activityMap[1] : '').matchAll(/:\s*'([A-Za-z]+)'/g)) used.add(match[1]);
  assert.ok(used.size >= 15, `expected many icons in use, found ${used.size}`);
  const missing = [...used].filter((name) => !ICON_NAMES.includes(name));
  assert.deepEqual(missing, [], 'icons used but not defined in ui.js');
});

test('every CSS class the UI sets is defined in styles.css (catches typos and forgotten styles)', async () => {
  const app = await read('src/app.js');
  const css = await read('styles.css');
  const html = await read('index.html');
  const defined = new Set([...css.matchAll(/\.([A-Za-z][\w-]*)/g)].map((match) => match[1]));
  const used = new Set();
  for (const match of app.matchAll(/class:\s*'([^'$]+)'/g)) match[1].split(/\s+/).forEach((token) => used.add(token));
  for (const match of html.matchAll(/class="([^"]+)"/g)) match[1].split(/\s+/).forEach((token) => used.add(token));
  // Template-literal classes (e.g. `chip chip-${kind}`) are covered by listing their expansions.
  for (const name of ['chip-approved', 'chip-pending', 'chip-submitted', 'chip-neutral', 'chip-new', 'act-employer', 'act-admin', 'act-student', 'act-faculty', 'act-system']) used.add(name);
  const undefinedClasses = [...used].filter((token) => !defined.has(token));
  assert.deepEqual(undefinedClasses, []);
});

test('styles: hidden attribute always wins, motion respects reduced-motion, tiles have six tones', async () => {
  const css = await read('styles.css');
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^}]*\{[^}]*animation:\s*none\s*!important/s);
  for (let i = 0; i < 6; i += 1) assert.match(css, new RegExp(`\\.tone-${i}\\b`));
});
