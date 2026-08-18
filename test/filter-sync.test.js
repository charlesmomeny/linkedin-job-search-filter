// Regression tests for filter-sync.js - the extension -> web filter
// mapping/audit used by Settings' "Sync Filters to Dashboard" control.
//
// Plain Node, built-in test runner only (no package manager, no
// third-party framework). Run with: node --test test/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const FilterSync = require('../filter-sync.js');

const FULL_SETTINGS = {
  enableFilters: true,
  hideFiltered: true,
  showReason: true,
  filterReposted: true,
  maxJobAge: 30,
  excludeTitles: ['Intern', 'Contract'],
  excludeAnywhere: ['Oracle'],
  excludeLocations: ['Texas', 'On-site'],
  includeTitles: ['Program Manager', 'Product Manager'],
  includeLocations: ['Remote'],
};

// ---------------------------------------------------------------------
// buildSyncPayload - the 4 exact/safe-adaptation mappings
// ---------------------------------------------------------------------

test('buildSyncPayload: maps includeTitles -> titleInclude, comma-joined', () => {
  const payload = FilterSync.buildSyncPayload(FULL_SETTINGS);
  assert.equal(payload.titleInclude, 'Program Manager, Product Manager');
});

test('buildSyncPayload: maps excludeTitles -> titleExclude, comma-joined', () => {
  const payload = FilterSync.buildSyncPayload(FULL_SETTINGS);
  assert.equal(payload.titleExclude, 'Intern, Contract');
});

test('buildSyncPayload: maps excludeLocations -> locationExclude, comma-joined', () => {
  const payload = FilterSync.buildSyncPayload(FULL_SETTINGS);
  assert.equal(payload.locationExclude, 'Texas, On-site');
});

test('buildSyncPayload: maps maxJobAge -> maxPostingAgeDays unchanged', () => {
  const payload = FilterSync.buildSyncPayload(FULL_SETTINGS);
  assert.equal(payload.maxPostingAgeDays, 30);
});

test('buildSyncPayload: includes the current schema version', () => {
  const payload = FilterSync.buildSyncPayload(FULL_SETTINGS);
  assert.equal(payload.version, FilterSync.SCHEMA_VERSION);
});

test('buildSyncPayload: never includes excludeAnywhere, includeLocations, filterReposted, or the display-only toggles', () => {
  const payload = FilterSync.buildSyncPayload(FULL_SETTINGS);
  const keys = Object.keys(payload);
  assert.deepEqual(
    keys.sort(),
    ['locationExclude', 'maxPostingAgeDays', 'titleExclude', 'titleInclude', 'version'].sort(),
  );
});

test('buildSyncPayload: empty settings produce empty strings and null age, never throws', () => {
  const payload = FilterSync.buildSyncPayload({});
  assert.deepEqual(payload, {
    version: FilterSync.SCHEMA_VERSION,
    titleInclude: '',
    titleExclude: '',
    locationExclude: '',
    maxPostingAgeDays: null,
  });
});

test('buildSyncPayload: null/undefined filterSettings never throws', () => {
  assert.doesNotThrow(() => FilterSync.buildSyncPayload(null));
  assert.doesNotThrow(() => FilterSync.buildSyncPayload(undefined));
});

test('buildSyncPayload: a non-number maxJobAge (defensive - should never happen from options.js) maps to null, not NaN/garbage', () => {
  const payload = FilterSync.buildSyncPayload({ maxJobAge: 'thirty' });
  assert.equal(payload.maxPostingAgeDays, null);
});

test('buildSyncPayload: never mutates the filterSettings object passed in', () => {
  const settings = JSON.parse(JSON.stringify(FULL_SETTINGS));
  FilterSync.buildSyncPayload(settings);
  assert.deepEqual(settings, FULL_SETTINGS);
});

// ---------------------------------------------------------------------
// summarizeSync - the "N filters synced, M weren't imported" report
// ---------------------------------------------------------------------

test('summarizeSync: reports all 4 supported settings as synced when all have content', () => {
  const { synced } = FilterSync.summarizeSync(FULL_SETTINGS);
  assert.deepEqual(
    synced.sort(),
    ['Maximum job age', 'Must Include in Title', 'Exclude from Job Title', 'Exclude Locations'].sort(),
  );
});

test('summarizeSync: reports all 3 unsupported-with-content settings', () => {
  const { unsupported } = FilterSync.summarizeSync(FULL_SETTINGS);
  assert.deepEqual(
    unsupported.sort(),
    [
      'Exclude from Anywhere (Title, Description, Company)',
      'Preferred Locations (highlight only)',
      'Filter out reposted jobs',
    ].sort(),
  );
});

test('summarizeSync: an unsupported setting left at its empty/off default is not reported', () => {
  const { unsupported } = FilterSync.summarizeSync({
    excludeAnywhere: [],
    includeLocations: [],
    filterReposted: false,
  });
  assert.deepEqual(unsupported, []);
});

test('summarizeSync: a supported setting left empty is not reported as synced', () => {
  const { synced } = FilterSync.summarizeSync({
    maxJobAge: null,
    includeTitles: [],
    excludeTitles: [],
    excludeLocations: [],
  });
  assert.deepEqual(synced, []);
});

test('summarizeSync: enableFilters/hideFiltered/showReason never appear in either list - not filter criteria', () => {
  const { synced, unsupported } = FilterSync.summarizeSync(FULL_SETTINGS);
  const all = [...synced, ...unsupported].join(' ');
  assert.equal(all.includes('Enable automatic filtering'), false);
  assert.equal(all.includes('hide filtered'), false);
  assert.equal(all.includes('Show why'), false);
});

test('summarizeSync: empty/null filterSettings reports nothing, never throws', () => {
  assert.deepEqual(FilterSync.summarizeSync({}), { synced: [], unsupported: [] });
  assert.doesNotThrow(() => FilterSync.summarizeSync(null));
});

test('summarizeSync: maxJobAge of 0 is treated as unset (falsy threshold), not a real 0-day filter', () => {
  const { synced } = FilterSync.summarizeSync({ maxJobAge: 0 });
  assert.equal(synced.includes('Maximum job age'), false);
});
