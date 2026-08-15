// Regression tests for job-freshness.js — the parsing behind making
// LinkedIn's Reposted and Maximum Job Age filters actually evaluate.
//
// Plain Node, built-in test runner only (no package manager, no
// third-party framework). Run with: node --test test/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const JobFreshness = require('../job-freshness.js');

// ---------------------------------------------------------------------
// isReposted
// ---------------------------------------------------------------------

test('isReposted: true when the card text contains a Reposted label', () => {
  assert.equal(JobFreshness.isReposted('program manager\nacme corp\nReposted 2 weeks ago'), true);
});

test('isReposted: case-insensitive', () => {
  assert.equal(JobFreshness.isReposted('REPOSTED 3 days ago'), true);
});

test('isReposted: false for an ordinary, non-reposted card', () => {
  assert.equal(JobFreshness.isReposted('program manager\nacme corp\nPromoted\nEasy Apply'), false);
});

test('isReposted: true even when the label is glued to adjacent text with no whitespace (regression)', () => {
  // Reproduces the real bug: a badge/pill label rendered as its own
  // DOM node with no actual space character before/after it in
  // card.textContent (CSS supplies the visual gap, not a text-node
  // space), which a \breposted\b word-boundary regex silently failed
  // to match.
  assert.equal(JobFreshness.isReposted('program managerReposted2w'), true);
  assert.equal(JobFreshness.isReposted('titleReposted'), true);
  assert.equal(JobFreshness.isReposted('Reposted2 weeks ago'), true);
});

test('isReposted: false for empty/non-string input, does not throw', () => {
  assert.doesNotThrow(() => JobFreshness.isReposted(''));
  assert.doesNotThrow(() => JobFreshness.isReposted(undefined));
  assert.equal(JobFreshness.isReposted(''), false);
  assert.equal(JobFreshness.isReposted(undefined), false);
});

// ---------------------------------------------------------------------
// parsePostedDaysAgo
// ---------------------------------------------------------------------

test('parsePostedDaysAgo: "X days ago"', () => {
  assert.equal(JobFreshness.parsePostedDaysAgo('Posted 3 days ago'), 3);
});

test('parsePostedDaysAgo: "X week(s) ago"', () => {
  assert.equal(JobFreshness.parsePostedDaysAgo('1 week ago'), 7);
  assert.equal(JobFreshness.parsePostedDaysAgo('2 weeks ago'), 14);
});

test('parsePostedDaysAgo: "X month(s) ago"', () => {
  assert.equal(JobFreshness.parsePostedDaysAgo('2 months ago'), 60);
});

test('parsePostedDaysAgo: "X year ago"', () => {
  assert.equal(JobFreshness.parsePostedDaysAgo('1 year ago'), 365);
});

test('parsePostedDaysAgo: "Yesterday" is 1 day', () => {
  assert.equal(JobFreshness.parsePostedDaysAgo('Yesterday'), 1);
});

test('parsePostedDaysAgo: "Just now" is 0 days', () => {
  assert.equal(JobFreshness.parsePostedDaysAgo('Just now'), 0);
});

test('parsePostedDaysAgo: abbreviated forms', () => {
  assert.equal(JobFreshness.parsePostedDaysAgo('3d'), 3);
  assert.equal(JobFreshness.parsePostedDaysAgo('2w'), 14);
  assert.equal(JobFreshness.parsePostedDaysAgo('1mo'), 30);
});

test('parsePostedDaysAgo: full phrase is not misread by the abbreviated pattern', () => {
  assert.equal(JobFreshness.parsePostedDaysAgo('Posted 3 days ago by the hiring manager'), 3);
});

test('parsePostedDaysAgo: returns null (unknown), not 0, when no pattern is found', () => {
  assert.equal(JobFreshness.parsePostedDaysAgo('program manager\nacme corp\nRemote'), null);
});

test('parsePostedDaysAgo: returns null for empty/non-string input, does not throw', () => {
  assert.doesNotThrow(() => JobFreshness.parsePostedDaysAgo(''));
  assert.doesNotThrow(() => JobFreshness.parsePostedDaysAgo(null));
  assert.equal(JobFreshness.parsePostedDaysAgo(''), null);
  assert.equal(JobFreshness.parsePostedDaysAgo(null), null);
});

test('parsePostedDaysAgo: case-insensitive', () => {
  assert.equal(JobFreshness.parsePostedDaysAgo('POSTED 5 DAYS AGO'), 5);
});
