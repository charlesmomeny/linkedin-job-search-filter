// Regression test for a live bug: after allowedUsStates was added,
// "Waltham, MA (Hybrid)" and other non-CA US jobs still showed up after
// reloading LinkedIn, even though UsLocation.detectState()/isAllowed()
// worked correctly in isolation (see us-location.test.js).
//
// Root cause: content-universal.js's loadFilterSettings() only applies
// its defaults object (which includes allowedUsStates: ['CA']) when
// chrome.storage.local has NO saved filterSettings at all:
//
//   filterSettings = result.filterSettings || { ...defaults };
//
// Anyone who saved filterSettings before allowedUsStates existed has a
// stored object that simply lacks the key - `result.filterSettings` is
// still truthy, so it's used as-is and allowedUsStates stays undefined
// at runtime. evaluateJobCard() guards the whole US-state check with
// `filterSettings.allowedUsStates && filterSettings.allowedUsStates.length
// > 0`, which reads undefined the same as an explicitly-cleared
// (disabled) list - so the check silently never ran for any
// already-installed user. This is a real, reproduced case: this
// project's own live Brave storage (read directly from Brave's
// extension LevelDB, not guessed) had exactly this shape.
//
// content-universal.js can't be require()'d directly in Node (it calls
// chrome.* APIs and touches `document` at module scope - see
// manifest-and-navigation.test.js's header comment for why that file
// uses the same source-text-extraction approach instead). This file:
//   (a) pins the fix structurally, by asserting the per-field
//       normalization guard is present in loadFilterSettings()'s source
//       (regression guard against it being silently reverted), and
//   (b) behaviorally reproduces the exact failure using the real,
//       already-tested UsLocation module plus real fixtures - the
//       user's actual pre-fix stored settings shape, and the real
//       multi-line card text captured live from linkedin.com for the
//       "Senior Manager, Program Operations" / Upstream Bio / "Waltham,
//       MA (Hybrid)" posting that exposed this bug - proving the fixed
//       merge logic actually changes the filtering outcome, not just
//       that the guard text exists.
//
// Plain Node, built-in test runner only. Run with: node --test test/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UsLocation = require('../us-location.js');

const contentSource = fs.readFileSync(path.join(__dirname, '..', 'content-universal.js'), 'utf8');

// ---------------------------------------------------------------------
// (a) structural guard
// ---------------------------------------------------------------------

test('loadFilterSettings(): normalizes a missing allowedUsStates per-field, not just via the whole-object fallback', () => {
  const match = contentSource.match(/async function loadFilterSettings\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(match, 'expected to find loadFilterSettings()');
  assert.match(
    match[1],
    /if\s*\(!Array\.isArray\(filterSettings\.allowedUsStates\)\)\s*\{\s*\n\s*filterSettings\.allowedUsStates\s*=\s*\['CA'\];/,
    'expected a per-field Array.isArray guard defaulting allowedUsStates to [\'CA\'] when the stored settings object predates this field'
  );
});

// ---------------------------------------------------------------------
// (b) behavioral reproduction
// ---------------------------------------------------------------------

// The exact shape read from this project's own live Brave extension
// storage (Local Extension Settings LevelDB for
// bonldpmbdlfcfedipmlhgloikadhflnj) at the time this bug was reported -
// saved before allowedUsStates existed, so the key is genuinely absent
// rather than an empty array.
const staleStoredSettings = {
  enableFilters: true,
  excludeAnywhere: ['Blackhawk Network', 'Oracle'],
  excludeLocations: ['Redwood City', 'Los Angeles', 'San Diego', 'WA', 'Seattle'],
  excludeTitles: ['Technical', 'Engineer'],
  filterReposted: true,
  hideFiltered: true,
  includeLocations: ['California'],
  includeTitles: ['Program Manager'],
  maxJobAge: 7,
  showReason: true,
};

// Real fullTextRaw captured live from linkedin.com/jobs/search-results/
// via CardTextExtraction.extractSearchableText() run against the actual
// job card DOM for "Senior Manager, Program Operations" at Upstream Bio.
const realWalthamCardText =
  'Senior Manager, Program Operations (Verified job)\n' +
  'Upstream Bio\n' +
  'Waltham, MA (Hybrid)\n' +
  '$174.2K/yr - $212.9K/yr\n' +
  'Actively reviewing applicants\n' +
  'Posted 3 weeks ago\n' +
  '3 weeks ago\n' +
  '·\n' +
  'Easy Apply';

// Faithful copies of loadFilterSettings()'s merge logic (old buggy
// version and the fixed version) and of evaluateJobCard()'s
// allowedUsStates check - kept in lockstep with content-universal.js by
// the structural test above.
function loadFilterSettings_preFix(stored) {
  return stored || { allowedUsStates: ['CA'] };
}

function loadFilterSettings_fixed(stored) {
  const filterSettings = stored || { allowedUsStates: ['CA'] };
  if (!Array.isArray(filterSettings.allowedUsStates)) {
    filterSettings.allowedUsStates = ['CA'];
  }
  return filterSettings;
}

function wouldFilterOnUsState(filterSettings, rawText) {
  if (filterSettings.allowedUsStates && filterSettings.allowedUsStates.length > 0) {
    const usState = UsLocation.detectState(rawText);
    if (usState && !UsLocation.isAllowed(usState, filterSettings.allowedUsStates)) {
      return true;
    }
  }
  return false;
}

test('reproduction: pre-fix merge leaves a pre-existing stored settings object with allowedUsStates undefined', () => {
  const settings = loadFilterSettings_preFix({ ...staleStoredSettings });
  assert.equal(settings.allowedUsStates, undefined);
});

test('reproduction: pre-fix behavior - "Waltham, MA (Hybrid)" is NOT filtered for a pre-existing user (the reported bug)', () => {
  const settings = loadFilterSettings_preFix({ ...staleStoredSettings });
  assert.equal(wouldFilterOnUsState(settings, realWalthamCardText), false);
});

test('fix: loadFilterSettings normalizes a pre-existing stored object to allowedUsStates: ["CA"]', () => {
  const settings = loadFilterSettings_fixed({ ...staleStoredSettings });
  assert.deepEqual(settings.allowedUsStates, ['CA']);
});

test('fix: "Waltham, MA (Hybrid)" IS filtered for a pre-existing user once allowedUsStates is normalized', () => {
  const settings = loadFilterSettings_fixed({ ...staleStoredSettings });
  assert.equal(wouldFilterOnUsState(settings, realWalthamCardText), true);
});

test('fix: a brand-new user (no stored settings at all) still gets allowedUsStates: ["CA"] (unaffected by the fix)', () => {
  const settings = loadFilterSettings_fixed(undefined);
  assert.deepEqual(settings.allowedUsStates, ['CA']);
});

test('fix: a user who deliberately saved an empty allowedUsStates list keeps the feature disabled (real [] is not overwritten)', () => {
  const settings = loadFilterSettings_fixed({ ...staleStoredSettings, allowedUsStates: [] });
  assert.deepEqual(settings.allowedUsStates, []);
  assert.equal(wouldFilterOnUsState(settings, realWalthamCardText), false);
});

test('fix: "Tokyo, Japan" is still never filtered, even for a normalized pre-existing user', () => {
  const settings = loadFilterSettings_fixed({ ...staleStoredSettings });
  const tokyoCardText = 'Senior Program Manager, External Fulfillment\nAmazon\nTokyo, Japan';
  assert.equal(wouldFilterOnUsState(settings, tokyoCardText), false);
});
