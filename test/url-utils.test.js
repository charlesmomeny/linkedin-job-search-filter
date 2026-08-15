// Regression tests for url-utils.js — the fix for CSV-imported job
// URLs reaching an anchor href without scheme validation.
//
// Plain Node, built-in test runner only (no package manager, no
// third-party framework). Run with: node --test test/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const UrlUtils = require('../url-utils.js');

// ---------------------------------------------------------------------
// Allowed
// ---------------------------------------------------------------------

test('allowed: a normal https LinkedIn job URL', () => {
  assert.equal(UrlUtils.isSafeJobUrl('https://www.linkedin.com/jobs/view/123'), true);
});

test('allowed: a normal http URL', () => {
  assert.equal(UrlUtils.isSafeJobUrl('http://example.com/job'), true);
});

test('allowed: a valid URL with leading/trailing whitespace is trimmed and accepted', () => {
  assert.equal(UrlUtils.isSafeJobUrl('  https://example.com/job  '), true);
});

test('allowed: a Built In job URL', () => {
  assert.equal(UrlUtils.isSafeJobUrl('https://builtin.com/job/program-manager/1234567'), true);
});

// ---------------------------------------------------------------------
// Rejected
// ---------------------------------------------------------------------

test('rejected: javascript: scheme', () => {
  assert.equal(UrlUtils.isSafeJobUrl('javascript:alert(1)'), false);
});

test('rejected: mixed-case JavaScript: scheme', () => {
  assert.equal(UrlUtils.isSafeJobUrl('JavaScript:alert(1)'), false);
});

test('rejected: data: scheme', () => {
  assert.equal(UrlUtils.isSafeJobUrl('data:text/html,<script>alert(1)</script>'), false);
});

test('rejected: file: scheme', () => {
  assert.equal(UrlUtils.isSafeJobUrl('file:///etc/passwd'), false);
});

test('rejected: chrome: scheme', () => {
  assert.equal(UrlUtils.isSafeJobUrl('chrome://settings'), false);
});

test('rejected: chrome-extension: scheme', () => {
  assert.equal(UrlUtils.isSafeJobUrl('chrome-extension://abc/popup.html'), false);
});

test('rejected: vbscript: scheme', () => {
  assert.equal(UrlUtils.isSafeJobUrl('vbscript:msgbox(1)'), false);
});

test('rejected: a scheme that parses fine but is not on the allowlist (ftp)', () => {
  // Demonstrates the allowlist is explicit, not "does new URL() accept it".
  assert.equal(UrlUtils.isSafeJobUrl('ftp://example.com/file'), false);
});

test('rejected: malformed text that is not a URL at all', () => {
  assert.equal(UrlUtils.isSafeJobUrl('not a url'), false);
});

test('rejected: a relative path with no scheme', () => {
  assert.equal(UrlUtils.isSafeJobUrl('/relative/path'), false);
});

test('rejected: empty string', () => {
  assert.equal(UrlUtils.isSafeJobUrl(''), false);
});

test('rejected: whitespace-only string', () => {
  assert.equal(UrlUtils.isSafeJobUrl('   '), false);
});

test('rejected: non-string input does not throw', () => {
  assert.doesNotThrow(() => UrlUtils.isSafeJobUrl(undefined));
  assert.doesNotThrow(() => UrlUtils.isSafeJobUrl(null));
  assert.equal(UrlUtils.isSafeJobUrl(undefined), false);
  assert.equal(UrlUtils.isSafeJobUrl(null), false);
});
