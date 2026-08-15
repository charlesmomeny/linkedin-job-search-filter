// Regression tests for job-identity.js — the shared canonical-identity
// logic that fixes the popup-delete / CSV-reimport duplication defects.
//
// Plain Node, built-in test runner only (no package manager, no
// third-party framework). Run with: node --test test/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const JobIdentity = require('../job-identity.js');

function mkJob(overrides) {
  return {
    title: 'Program Manager',
    company: 'Acme Corp',
    location: 'Remote',
    source: 'LinkedIn',
    url: 'https://example.com/job',
    dateSaved: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

// ---------------------------------------------------------------------
// storageKey(): write-path format. Must stay byte-identical to the
// original content-universal.js generateDedupeKey() algorithm so
// existing users' stored keys remain valid with no migration.
// ---------------------------------------------------------------------

test('storageKey: LinkedIn job with numeric jobId uses source_jobId format', () => {
  const job = mkJob({ source: 'LinkedIn', jobId: '4327592663' });
  assert.equal(JobIdentity.storageKey(job), 'LinkedIn_4327592663');
});

test('storageKey: Built In job with numeric jobId uses source_jobId format', () => {
  const job = mkJob({ source: 'Built In', jobId: '8111128' });
  assert.equal(JobIdentity.storageKey(job), 'Built In_8111128');
});

test('storageKey: Himalayas job with slug jobId preserves the slug as-is', () => {
  const job = mkJob({ source: 'Himalayas', jobId: 'acme-corp/senior-engineer' });
  assert.equal(JobIdentity.storageKey(job), 'Himalayas_acme-corp/senior-engineer');
});

test('storageKey: job with no jobId falls back to source_title_company_location, lowercased/underscored', () => {
  const job = mkJob({ source: 'Built In', jobId: undefined, title: 'Program Manager', company: 'Acme Corp', location: 'Remote' });
  assert.equal(JobIdentity.storageKey(job), 'built_in_program_manager_acme_corp_remote');
});

// ---------------------------------------------------------------------
// Organic Delete Identity: findExistingKey() must return the REAL
// persisted key for each representative job shape, not a recomputed one.
// ---------------------------------------------------------------------

test('findExistingKey: returns the actual stored key for a LinkedIn numeric-ID job', () => {
  const stored = mkJob({ source: 'LinkedIn', jobId: '4327592663' });
  const savedJobs = { LinkedIn_4327592663: stored };
  const lookup = mkJob({ source: 'LinkedIn', jobId: '4327592663' });
  assert.equal(JobIdentity.findExistingKey(savedJobs, lookup), 'LinkedIn_4327592663');
});

test('findExistingKey: returns the actual stored key for a Built In numeric-ID job', () => {
  const stored = mkJob({ source: 'Built In', jobId: '8111128' });
  const savedJobs = { 'Built In_8111128': stored };
  const lookup = mkJob({ source: 'Built In', jobId: '8111128' });
  assert.equal(JobIdentity.findExistingKey(savedJobs, lookup), 'Built In_8111128');
});

test('findExistingKey: returns the actual stored key for a Himalayas slug/path-ID job', () => {
  const stored = mkJob({ source: 'Himalayas', jobId: 'acme-corp/senior-engineer' });
  const savedJobs = { 'Himalayas_acme-corp/senior-engineer': stored };
  const lookup = mkJob({ source: 'Himalayas', jobId: 'acme-corp/senior-engineer' });
  assert.equal(JobIdentity.findExistingKey(savedJobs, lookup), 'Himalayas_acme-corp/senior-engineer');
});

test('findExistingKey: returns the actual stored key for a fallback job with no jobId', () => {
  const stored = mkJob({ source: 'Himalayas', jobId: undefined, title: 'Remote Designer', company: 'Studio X', location: 'Remote' });
  const key = 'himalayas_remote_designer_studio_x_remote';
  const savedJobs = { [key]: stored };
  const lookup = mkJob({ source: 'Himalayas', jobId: undefined, title: 'Remote Designer', company: 'Studio X', location: 'Remote' });
  assert.equal(JobIdentity.findExistingKey(savedJobs, lookup), key);
});

// ---------------------------------------------------------------------
// Historical-Key Compatibility: entries stored under pre-fix key
// formats must still be found/deletable by their real key.
// ---------------------------------------------------------------------

test('findExistingKey: matches an entry stored under a historical popup-style key ("jobid_...")', () => {
  const stored = mkJob({ source: 'LinkedIn', jobId: '4327592663' });
  const savedJobs = { jobid_4327592663: stored }; // pre-fix popup.js key shape
  const lookup = mkJob({ source: 'LinkedIn', jobId: '4327592663' });
  assert.equal(JobIdentity.findExistingKey(savedJobs, lookup), 'jobid_4327592663');
});

test('findExistingKey: matches a Himalayas entry whose historical key used "_" instead of "/" in the slug', () => {
  // Pre-fix popup.js extractJobIdFromURL() replaced "/" with "_".
  const stored = mkJob({ source: 'Himalayas', jobId: 'acme-corp_senior-engineer' });
  const savedJobs = { jobid_acme_corp_senior_engineer: stored };
  const lookup = mkJob({ source: 'Himalayas', jobId: 'acme-corp/senior-engineer' });
  assert.equal(JobIdentity.findExistingKey(savedJobs, lookup), 'jobid_acme_corp_senior_engineer');
});

// ---------------------------------------------------------------------
// Import Duplicate Detection
// ---------------------------------------------------------------------

test('import duplicate: re-importing the same LinkedIn job (organically saved) is recognized, not duplicated', () => {
  const organic = mkJob({ source: 'LinkedIn', jobId: '4327592663' });
  const savedJobs = { [JobIdentity.storageKey(organic)]: organic };
  const imported = mkJob({ source: 'LinkedIn', jobId: '4327592663', dateSaved: '2026-02-01T00:00:00.000Z' });
  assert.equal(JobIdentity.findExistingKey(savedJobs, imported), JobIdentity.storageKey(organic));
});

test('import duplicate: re-importing the same Built In job (organically saved) is recognized, not duplicated', () => {
  const organic = mkJob({ source: 'Built In', jobId: '8111128' });
  const savedJobs = { [JobIdentity.storageKey(organic)]: organic };
  const imported = mkJob({ source: 'Built In', jobId: '8111128' });
  assert.equal(JobIdentity.findExistingKey(savedJobs, imported), JobIdentity.storageKey(organic));
});

test('import duplicate: re-importing the same Himalayas job (organically saved) is recognized, not duplicated', () => {
  const organic = mkJob({ source: 'Himalayas', jobId: 'acme-corp/senior-engineer' });
  const savedJobs = { [JobIdentity.storageKey(organic)]: organic };
  // extractJobIdFromURL() in popup.js normalizes "/" to "_" on import.
  const imported = mkJob({ source: 'Himalayas', jobId: 'acme-corp_senior-engineer' });
  assert.equal(JobIdentity.findExistingKey(savedJobs, imported), JobIdentity.storageKey(organic));
});

test('import duplicate: fallback-key identical jobs (no jobId, differing case/whitespace) are recognized as duplicates', () => {
  const organic = mkJob({ source: 'Built In', jobId: undefined, title: '  Program   Manager ', company: 'Acme Corp', location: 'Remote' });
  const savedJobs = { [JobIdentity.storageKey(organic)]: organic };
  const imported = mkJob({ source: 'Built In', jobId: undefined, title: 'program manager', company: 'ACME CORP', location: 'remote' });
  assert.notEqual(JobIdentity.findExistingKey(savedJobs, imported), null);
});

test('import duplicate: reverse case — existing historical/import-style entry recognized by a fresh import representation', () => {
  const historical = mkJob({ source: 'LinkedIn', jobId: '4327592663' });
  const savedJobs = { jobid_4327592663: historical }; // pre-fix popup import key shape
  const freshImport = mkJob({ source: 'LinkedIn', jobId: '4327592663' });
  assert.equal(JobIdentity.findExistingKey(savedJobs, freshImport), 'jobid_4327592663');
});

// ---------------------------------------------------------------------
// Different-Job Protection: exact duplicate detection must not become
// overly aggressive. No fuzzy/similarity matching.
// ---------------------------------------------------------------------

test('different jobs with different jobIds on the same source remain distinct', () => {
  const jobA = mkJob({ source: 'LinkedIn', jobId: '111' });
  const jobB = mkJob({ source: 'LinkedIn', jobId: '222' });
  const savedJobs = { [JobIdentity.storageKey(jobA)]: jobA };
  assert.equal(JobIdentity.findExistingKey(savedJobs, jobB), null);
});

test('same jobId on different sources remain distinct (source-qualified identity)', () => {
  const jobA = mkJob({ source: 'LinkedIn', jobId: '12345' });
  const jobB = mkJob({ source: 'Built In', jobId: '12345' });
  const savedJobs = { [JobIdentity.storageKey(jobA)]: jobA };
  assert.equal(JobIdentity.findExistingKey(savedJobs, jobB), null);
});

test('fallback-identity jobs with different titles remain distinct', () => {
  const jobA = mkJob({ source: 'Himalayas', jobId: undefined, title: 'Backend Engineer', company: 'Acme', location: 'Remote' });
  const jobB = mkJob({ source: 'Himalayas', jobId: undefined, title: 'Frontend Engineer', company: 'Acme', location: 'Remote' });
  const savedJobs = { [JobIdentity.storageKey(jobA)]: jobA };
  assert.equal(JobIdentity.findExistingKey(savedJobs, jobB), null);
});

test('empty savedJobs never matches anything', () => {
  const job = mkJob({ source: 'LinkedIn', jobId: '1' });
  assert.equal(JobIdentity.findExistingKey({}, job), null);
});

// ---------------------------------------------------------------------
// Mocked-storage simulation of the actual popup.js delete/import flow,
// without touching real chrome.storage.local or the DOM.
// ---------------------------------------------------------------------

function mockDeleteFlow(savedJobs, keyToDelete) {
  const copy = { ...savedJobs };
  delete copy[keyToDelete];
  return copy;
}

test('mocked flow: deleting an organic entry via its real Object.entries key removes exactly that job', () => {
  const organic = mkJob({ source: 'LinkedIn', jobId: '4327592663' });
  const key = JobIdentity.storageKey(organic);
  let savedJobs = { [key]: organic };

  // Simulates popup.js: render iterates Object.entries() -> the real
  // key travels to the delete button's data-key -> deleteJob(realKey).
  const [[renderedKey]] = Object.entries(savedJobs);
  assert.equal(renderedKey, key);

  savedJobs = mockDeleteFlow(savedJobs, renderedKey);
  assert.deepEqual(savedJobs, {});
});

test('mocked flow: historical popup-style entry is still deletable via its real key', () => {
  const historical = mkJob({ source: 'LinkedIn', jobId: '4327592663' });
  let savedJobs = { jobid_4327592663: historical }; // pre-fix key shape, may already exist for real users

  const [[renderedKey]] = Object.entries(savedJobs);
  assert.equal(renderedKey, 'jobid_4327592663');

  savedJobs = mockDeleteFlow(savedJobs, renderedKey);
  assert.deepEqual(savedJobs, {});
});

test('mocked flow: import skips a job matching an existing organic entry, and adds a genuinely new one', () => {
  const organic = mkJob({ source: 'LinkedIn', jobId: '4327592663' });
  let savedJobs = { [JobIdentity.storageKey(organic)]: organic };

  const importedJobs = [
    mkJob({ source: 'LinkedIn', jobId: '4327592663' }), // duplicate of organic
    mkJob({ source: 'Built In', jobId: '9999999', title: 'New Role' }) // genuinely new
  ];

  let addedCount = 0;
  let skippedCount = 0;
  importedJobs.forEach(job => {
    const existingKey = JobIdentity.findExistingKey(savedJobs, job);
    if (existingKey) {
      skippedCount++;
      return;
    }
    savedJobs[JobIdentity.storageKey(job)] = job;
    addedCount++;
  });

  assert.equal(addedCount, 1);
  assert.equal(skippedCount, 1);
  assert.equal(Object.keys(savedJobs).length, 2);
});

test('mocked flow: Himalayas slug/path identity is stable across "/"-vs-"_" key variants during import', () => {
  const organic = mkJob({ source: 'Himalayas', jobId: 'acme-corp/senior-engineer' });
  let savedJobs = { [JobIdentity.storageKey(organic)]: organic };

  const imported = mkJob({ source: 'Himalayas', jobId: 'acme-corp_senior-engineer' });
  const existingKey = JobIdentity.findExistingKey(savedJobs, imported);
  assert.notEqual(existingKey, null);

  if (!existingKey) savedJobs[JobIdentity.storageKey(imported)] = imported;
  assert.equal(Object.keys(savedJobs).length, 1);
});
