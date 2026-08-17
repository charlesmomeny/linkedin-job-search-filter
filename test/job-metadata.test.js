// Regression tests for job-metadata.js - the helper behind extracting
// LinkedIn's job-detail "pills row" (workplace type / employment type
// / salary) and the applicant-signal/promoted/application-handling
// text found in the same top-card area as location. Confirmed live
// against real LinkedIn job-detail pages (Surge AI, Origin Lab,
// exacare ai, Parsec Education) via /jobs/view/<id> - see
// job-metadata.js and site-adapters.js's extractJobData() for how
// this is used.
//
// Plain Node, built-in test runner only (no package manager, no
// third-party framework). Run with: node --test test/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const JobMetadata = require('../job-metadata.js');

// ---------------------------------------------------------------------
// parsePillsText - workplaceType / employmentType / salaryText
// ---------------------------------------------------------------------

test('parsePillsText: extracts workplace type from a cleanly separated pills row', () => {
  const result = JobMetadata.parsePillsText('Remote\n            \n     Contract');
  assert.equal(result.workplaceType, 'Remote');
  assert.equal(result.employmentType, 'Contract');
  assert.equal(result.salaryText, null);
});

test('parsePillsText: extracts workplace + employment type from a real glued pills row (no delimiter)', () => {
  // Confirmed live: Parsec Education "Software Engineer II" posting.
  const result = JobMetadata.parsePillsText('$90K/yr - $115K/yrOn-siteFull-time');
  assert.equal(result.salaryText, '$90K/yr - $115K/yr');
  assert.equal(result.workplaceType, 'On-site');
  assert.equal(result.employmentType, 'Full-time');
});

test('parsePillsText: extracts a salary range without swallowing an adjacent glued pill', () => {
  // Confirmed live pattern from the original extraction audit.
  const result = JobMetadata.parsePillsText('$216K/yr - $240K/yrOn-siteFull-time');
  assert.equal(result.salaryText, '$216K/yr - $240K/yr');
  assert.equal(result.workplaceType, 'On-site');
  assert.equal(result.employmentType, 'Full-time');
});

test('parsePillsText: salary is null when the pills row does not disclose one', () => {
  const result = JobMetadata.parsePillsText('Hybrid\n            \n     Full-time');
  assert.equal(result.salaryText, null);
  assert.equal(result.workplaceType, 'Hybrid');
  assert.equal(result.employmentType, 'Full-time');
});

test('parsePillsText: returns null for all fields when the text matches none of them', () => {
  const result = JobMetadata.parsePillsText('Some unrelated paragraph of text.');
  assert.deepEqual(result, { workplaceType: null, employmentType: null, salaryText: null });
});

test('parsePillsText: returns null for all fields on non-string input', () => {
  assert.deepEqual(JobMetadata.parsePillsText(null), {
    workplaceType: null,
    employmentType: null,
    salaryText: null,
  });
  assert.deepEqual(JobMetadata.parsePillsText(undefined), {
    workplaceType: null,
    employmentType: null,
    salaryText: null,
  });
});

// ---------------------------------------------------------------------
// parseStatusText - applicantSignal / promoted / applicationHandling
// ---------------------------------------------------------------------

test('parseStatusText: extracts a "clicked apply" applicant signal, preserving exact wording', () => {
  // Confirmed live: Surge AI "Senior Software Engineer" posting - the
  // full glued top-card text.
  const result = JobMetadata.parseStatusText(
    'Salt Lake City, UT · 1 week ago · 25 people clicked applyPromoted by hirer · Responses managed off LinkedIn',
  );
  assert.equal(result.applicantSignal, '25 people clicked apply');
  assert.equal(result.promoted, true);
  assert.equal(result.applicationHandling, 'Responses managed off LinkedIn');
});

test('parseStatusText: extracts an "Over N people clicked apply" applicant signal', () => {
  // Confirmed live: exacare ai "Senior Software Engineer (Front-end)".
  const result = JobMetadata.parseStatusText(
    'New York, NY · 3 weeks ago · Over 100 people clicked applyPromoted by hirer · Responses managed off LinkedIn',
  );
  assert.equal(result.applicantSignal, 'Over 100 people clicked apply');
});

test('parseStatusText: extracts an "Over N applicants" applicant signal (different phrasing)', () => {
  // Confirmed live: Origin Lab "Software Engineer, SDK & Engine
  // Integrations" - note this posting has NO "Responses managed off
  // LinkedIn" text; "Actively reviewing applicants" follows instead
  // and must never be mistaken for applicationHandling.
  const result = JobMetadata.parseStatusText(
    'Los Angeles Metropolitan Area · 1 month ago · Over 100 applicantsPromoted by hirer · Actively reviewing applicants',
  );
  assert.equal(result.applicantSignal, 'Over 100 applicants');
  assert.equal(result.promoted, true);
  assert.equal(result.applicationHandling, null);
});

test('parseStatusText: promoted is false when "Promoted by hirer" is absent', () => {
  const result = JobMetadata.parseStatusText('San Francisco, CA · 1 week ago · Over 100 people clicked apply');
  assert.equal(result.promoted, false);
});

test('parseStatusText: applicationHandling is null when absent, even with other fields present', () => {
  const result = JobMetadata.parseStatusText('United States · 10 hours ago · 10 people clicked apply');
  assert.equal(result.applicationHandling, null);
});

test('parseStatusText: applicantSignal is null when the text has no recognizable phrasing', () => {
  const result = JobMetadata.parseStatusText('San Francisco, CA · 1 week ago');
  assert.equal(result.applicantSignal, null);
});

test('parseStatusText: "Actively reviewing applicants" alone is never treated as applicationHandling', () => {
  const result = JobMetadata.parseStatusText('Promoted by hirer · Actively reviewing applicants');
  assert.equal(result.promoted, true);
  assert.equal(result.applicationHandling, null);
});

test('parseStatusText: returns defaults (nulls, promoted false) on non-string input', () => {
  assert.deepEqual(JobMetadata.parseStatusText(null), {
    applicantSignal: null,
    promoted: false,
    applicationHandling: null,
  });
  assert.deepEqual(JobMetadata.parseStatusText(undefined), {
    applicantSignal: null,
    promoted: false,
    applicationHandling: null,
  });
});

test('parseStatusText: returns defaults for an empty or unrelated string', () => {
  const result = JobMetadata.parseStatusText('Some unrelated paragraph of text.');
  assert.deepEqual(result, { applicantSignal: null, promoted: false, applicationHandling: null });
});
