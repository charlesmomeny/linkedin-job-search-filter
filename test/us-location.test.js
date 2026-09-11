// Regression tests for us-location.js - the helper behind filtering out
// jobs explicitly located in a non-allowed US state (e.g. "Waltham, MA"
// getting through a CA-only filter). See us-location.js's header for the
// root cause (a naive whole-text search for 2-letter state codes like
// "IN"/"OR"/"HI" would false-positive on ordinary English words) and
// content-universal.js's evaluateJobCard() for how this is used.
//
// Plain Node, built-in test runner only (no package manager, no
// third-party framework). Run with: node --test test/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const UsLocation = require('../us-location.js');

function cardText(...lines) {
  return lines.join('\n');
}

// ---------------------------------------------------------------------
// detectState: the four scenarios from the bug report
// ---------------------------------------------------------------------

test('detectState: "Waltham, MA (Hybrid)" -> Massachusetts', () => {
  const text = cardText('Program Manager', 'Acme Corp', 'Waltham, MA (Hybrid)');
  assert.deepEqual(UsLocation.detectState(text), { abbr: 'MA', name: 'Massachusetts' });
});

test('detectState: "Indiana, United States" -> Indiana', () => {
  const text = cardText('Program Manager', 'Acme Corp', 'Indiana, United States');
  assert.deepEqual(UsLocation.detectState(text), { abbr: 'IN', name: 'Indiana' });
});

test('detectState: "Parsippany, NJ (Hybrid)" -> New Jersey', () => {
  const text = cardText('Program Manager', 'Acme Corp', 'Parsippany, NJ (Hybrid)');
  assert.deepEqual(UsLocation.detectState(text), { abbr: 'NJ', name: 'New Jersey' });
});

test('detectState: "Tokyo, Japan" -> no state detected', () => {
  const text = cardText('Program Manager', 'Acme Corp', 'Tokyo, Japan');
  assert.equal(UsLocation.detectState(text), null);
});

test('detectState: "San Francisco, CA" -> California (still detected; allow-list decides filtering)', () => {
  const text = cardText('Program Manager', 'Acme Corp', 'San Francisco, CA');
  assert.deepEqual(UsLocation.detectState(text), { abbr: 'CA', name: 'California' });
});

// ---------------------------------------------------------------------
// detectState: preserving remote behavior
// ---------------------------------------------------------------------

test('detectState: bare "United States (Remote)" with no state named -> no state detected', () => {
  const text = cardText('Principal Program Manager', 'Oracle', 'United States (Remote)');
  assert.equal(UsLocation.detectState(text), null);
});

test('detectState: bare "Remote" -> no state detected', () => {
  const text = cardText('Staff Software Engineer', 'Acme Corp', 'Remote');
  assert.equal(UsLocation.detectState(text), null);
});

// ---------------------------------------------------------------------
// detectState: abbreviation collision safety (the reason this can't be
// a naive whole-text search for 2-letter state codes)
// ---------------------------------------------------------------------

for (const word of ['in', 'or', 'hi', 'me', 'ok']) {
  test(`detectState: ordinary lowercase word "${word}" embedded in prose is never mistaken for a state code`, () => {
    const text = cardText(
      'Program Manager',
      'Acme Corp',
      `We are looking for someone interested ${word} this exciting role, ${word} a hybrid setting.`,
    );
    assert.equal(UsLocation.detectState(text), null);
  });
}

test('detectState: uppercase 2-letter state code only matches at the expected "<City>, XX" position, not mid-sentence', () => {
  // "IN" appearing uppercase but NOT in the trailing "<City>, XX" shape
  // (e.g. shouting emphasis mid-sentence) must not match.
  const text = cardText('Program Manager', 'Acme Corp', 'Apply IN the next 24 hours to be considered');
  assert.equal(UsLocation.detectState(text), null);
});

test('detectState: lowercase state abbreviation in the right position does not match (real postings render it uppercase)', () => {
  const text = cardText('Program Manager', 'Acme Corp', 'Waltham, ma (Hybrid)');
  assert.equal(UsLocation.detectState(text), null);
});

// ---------------------------------------------------------------------
// detectState: misc
// ---------------------------------------------------------------------

test('detectState: unrecognized 2-letter suffix is not treated as a state', () => {
  const text = cardText('Program Manager', 'Bank of Acme, NA');
  assert.equal(UsLocation.detectState(text), null);
});

test('detectState: non-string input never throws', () => {
  assert.equal(UsLocation.detectState(null), null);
  assert.equal(UsLocation.detectState(undefined), null);
  assert.equal(UsLocation.detectState(42), null);
});

// ---------------------------------------------------------------------
// isAllowed
// ---------------------------------------------------------------------

test('isAllowed: state in the allow-list (by abbreviation) is allowed', () => {
  assert.equal(UsLocation.isAllowed({ abbr: 'CA', name: 'California' }, ['CA']), true);
});

test('isAllowed: state in the allow-list (by full name, case-insensitive) is allowed', () => {
  assert.equal(UsLocation.isAllowed({ abbr: 'CA', name: 'California' }, ['california']), true);
});

test('isAllowed: state not in the allow-list is not allowed', () => {
  assert.equal(UsLocation.isAllowed({ abbr: 'MA', name: 'Massachusetts' }, ['CA']), false);
});

test('isAllowed: null state (nothing detected) is always allowed', () => {
  assert.equal(UsLocation.isAllowed(null, ['CA']), true);
});

test('isAllowed: non-array allow-list treated as empty (nothing allowed)', () => {
  assert.equal(UsLocation.isAllowed({ abbr: 'CA', name: 'California' }, undefined), false);
});
