// Regression tests for job-location.js - the helper behind the fix for
// LinkedIn job locations (e.g. "San Francisco, CA") extracting as
// blank. Confirmed live against real LinkedIn job-detail pages (OpenAI,
// Microsoft, LinkedIn, and others) via /jobs/view/<id> - see
// job-location.js and site-adapters.js's extractJobData() for how this
// is used.
//
// Plain Node, built-in test runner only (no package manager, no
// third-party framework). Run with: node --test test/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const JobLocation = require('../job-location.js');

test('parseLocationLine: extracts a city/state location', () => {
  assert.equal(
    JobLocation.parseLocationLine('San Francisco, CA · 1 week ago · Over 100 people clicked apply'),
    'San Francisco, CA',
  );
});

test('parseLocationLine: extracts "United States" when that is the shown location', () => {
  assert.equal(
    JobLocation.parseLocationLine('United States · 10 hours ago · 10 people clicked apply'),
    'United States',
  );
});

test('parseLocationLine: handles a different applicant-count phrasing', () => {
  assert.equal(
    JobLocation.parseLocationLine('United States · 3 months ago · Over 100 applicants'),
    'United States',
  );
});

test('parseLocationLine: returns null for the "Promoted by hirer" line, never mistaking it for location', () => {
  assert.equal(
    JobLocation.parseLocationLine('Promoted by hirer · Responses managed off LinkedIn'),
    null,
  );
});

test('parseLocationLine: returns null for a line starting with "Responses"', () => {
  assert.equal(JobLocation.parseLocationLine('Responses managed off LinkedIn'), null);
});

test('parseLocationLine: returns null when there is no " · " separator at all', () => {
  assert.equal(JobLocation.parseLocationLine('Some unrelated paragraph of text.'), null);
});

test('parseLocationLine: returns null for an empty or whitespace-only string', () => {
  assert.equal(JobLocation.parseLocationLine(''), null);
  assert.equal(JobLocation.parseLocationLine('   '), null);
});

test('parseLocationLine: returns null for non-string input', () => {
  assert.equal(JobLocation.parseLocationLine(null), null);
  assert.equal(JobLocation.parseLocationLine(undefined), null);
  assert.equal(JobLocation.parseLocationLine(42), null);
});

test('parseLocationLine: trims surrounding whitespace from the extracted location', () => {
  assert.equal(
    JobLocation.parseLocationLine('  San Francisco, CA  · 1 week ago'),
    'San Francisco, CA',
  );
});
