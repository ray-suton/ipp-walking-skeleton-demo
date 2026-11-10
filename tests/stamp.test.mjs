import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stamp, ASSETS } from '../scripts/stamp.mjs';

const HTML = '<link rel="stylesheet" href="styles.css"><script src="src/store.js"></script><script src="src/ui.js"></script><script src="src/app.js?v=deadbeef00"></script>';
const fakeFiles = (seed) => async (path) => Buffer.from(`${seed}:${path}`);

test('index.html asset URLs carry the hash of the current file contents (run `npm run stamp` if this fails)', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(await stamp(html), html, 'index.html is stale: a deploy would let browsers mix old assets with new HTML');
  for (const asset of ASSETS) assert.match(html, new RegExp(`${asset.replace('.', '\\.')}\\?v=[0-9a-f]{10}"`), `${asset} is versioned`);
});

test('stamp: the version changes when a file changes, replaces an old hash, and is idempotent', async () => {
  const first = await stamp(HTML, fakeFiles('A'));
  const second = await stamp(HTML, fakeFiles('B'));
  assert.notEqual(first, second);
  assert.ok(!first.includes('deadbeef00'), 'a previous hash is replaced, not appended');
  assert.equal(await stamp(first, fakeFiles('A')), first);
  assert.equal([...first.matchAll(/\?v=[0-9a-f]{10}/g)].length, 4);
  assert.equal(new Set([...first.matchAll(/\?v=([0-9a-f]{10})/g)].map((m) => m[1])).size, 4, 'each file gets its own hash');
});

test('stamp refuses an index.html that does not reference every asset', async () => {
  await assert.rejects(stamp('<html></html>', fakeFiles('A')), /does not reference styles\.css/);
});
