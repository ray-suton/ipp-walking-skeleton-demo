import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/ui.js');
const { initials, toneIndex, timeAgo, ICON_NAMES } = globalThis.IPPUI;

test('initials: logo tiles and avatars get one or two capital letters', () => {
  assert.equal(initials('Evergreen Labs'), 'EL');
  assert.equal(initials('Northstar Analytics'), 'NA');
  assert.equal(initials('Harbor'), 'HA');
  assert.equal(initials('x'), 'X');
  assert.equal(initials('Dr. Sam Okafor'), 'SO', 'titles are skipped');
  assert.equal(initials('  alex   r. lee '), 'AR');
  assert.equal(initials(''), '?');
  assert.equal(initials(undefined), '?');
  assert.equal(initials('???'), '?');
});

test('initials: a lone title is still shown rather than dropped', () => {
  assert.equal(initials('Dr'), 'DR');
});

test('toneIndex: stable, case-insensitive, always one of the six styled slots', () => {
  assert.equal(toneIndex('Evergreen Labs'), toneIndex('evergreen labs '));
  const seen = new Set();
  for (const name of ['Evergreen Labs', 'Northstar Analytics', 'Harbor Robotics', 'Atlas Health Labs', 'Cedar Ledger Partners', 'Test Org', 'A', '']) {
    const tone = toneIndex(name);
    assert.ok(Number.isInteger(tone) && tone >= 0 && tone <= 5, `${name} -> ${tone}`);
    seen.add(tone);
  }
  assert.ok(seen.size >= 3, 'colours actually vary between organizations');
});

test('timeAgo: buckets from "just now" to days, never negative', () => {
  const now = Date.parse('2026-11-09T12:00:00Z');
  const ago = (seconds) => timeAgo(new Date(now - seconds * 1000).toISOString(), now);
  assert.equal(ago(0), 'just now');
  assert.equal(ago(9), 'just now');
  assert.equal(ago(10), '10s ago');
  assert.equal(ago(59), '59s ago');
  assert.equal(ago(60), '1 min ago');
  assert.equal(ago(59 * 60), '59 min ago');
  assert.equal(ago(3600), '1 h ago');
  assert.equal(ago(23 * 3600), '23 h ago');
  assert.equal(ago(24 * 3600), 'yesterday');
  assert.equal(ago(3 * 24 * 3600), '3 days ago');
  assert.equal(ago(-30), 'just now', 'clock skew into the future is clamped');
  assert.equal(timeAgo('not a date', now), '');
});

test('icon set: a reasonable number of icons, with the names the UI relies on', () => {
  assert.ok(ICON_NAMES.length >= 20);
  for (const name of ['home', 'briefcase', 'shield', 'cap', 'book', 'check', 'checkCircle', 'send', 'arrow', 'lock', 'clock', 'pin', 'monitor']) {
    assert.ok(ICON_NAMES.includes(name), name);
  }
});
