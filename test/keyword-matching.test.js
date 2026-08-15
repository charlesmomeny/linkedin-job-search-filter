// Regression tests for keyword-matching.js — the fix for the filter
// engine crashing when a user-entered keyword contains regex
// metacharacters (e.g. "C++").
//
// Plain Node, built-in test runner only (no package manager, no
// third-party framework). Run with: node --test test/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const KeywordMatching = require('../keyword-matching.js');

// ---------------------------------------------------------------------
// Ordinary Whole-Word Behavior
// ---------------------------------------------------------------------

test('ordinary word: "manager" matches "Senior Program Manager"', () => {
  assert.equal(KeywordMatching.containsKeyword('Senior Program Manager', 'manager'), true);
});

test('ordinary word: "manager" does not match "managerial"', () => {
  assert.equal(KeywordMatching.containsKeyword('managerial', 'manager'), false);
});

test('ordinary word: matching is case-insensitive both ways', () => {
  assert.equal(KeywordMatching.containsKeyword('SENIOR MANAGER', 'Manager'), true);
  assert.equal(KeywordMatching.containsKeyword('senior manager', 'MANAGER'), true);
});

test('ordinary word: text-side surrounding whitespace does not break matching', () => {
  assert.equal(KeywordMatching.containsKeyword('  Senior Manager  ', 'manager'), true);
});

// ---------------------------------------------------------------------
// Special Characters — must match literally and must never throw
// ---------------------------------------------------------------------

test('C++: matches literal "C++" in text', () => {
  assert.equal(KeywordMatching.containsKeyword('Looking for a C++ engineer', 'C++'), true);
});

test('C++: does not throw (the original SyntaxError-crash case)', () => {
  assert.doesNotThrow(() => KeywordMatching.containsKeyword('Looking for a C++ engineer', 'C++'));
});

test('C++: does not match as a bare substring of a longer identifier', () => {
  // Leading "C" is preceded by another word character ("B"), so there is
  // no true word-start boundary here - consistent with \b semantics.
  assert.equal(KeywordMatching.containsKeyword('ABC++ Framework', 'C++'), false);
});

test('C#: matches literal "C#" in text and does not throw', () => {
  assert.doesNotThrow(() => KeywordMatching.containsKeyword('C# developer wanted', 'C#'));
  assert.equal(KeywordMatching.containsKeyword('C# developer wanted', 'C#'), true);
});

test('parentheses: "(Remote)" matches the literal text, not as a regex group', () => {
  assert.equal(KeywordMatching.containsKeyword('Fully (Remote) role', '(Remote)'), true);
  // If parens were treated as a capturing group, this would also match
  // text that only contains "Remote" without literal parentheses.
  assert.equal(KeywordMatching.containsKeyword('Fully Remote role', '(Remote)'), false);
});

test('dot: "a.b" matches the literal text and does not treat "." as a wildcard', () => {
  assert.equal(KeywordMatching.containsKeyword('value a.b here', 'a.b'), true);
  assert.equal(KeywordMatching.containsKeyword('value axb here', 'a.b'), false);
});

test('brackets: a keyword containing "[" or "]" does not throw and matches literally', () => {
  assert.doesNotThrow(() => KeywordMatching.containsKeyword('Now hiring [Remote]', '[Remote]'));
  assert.equal(KeywordMatching.containsKeyword('Now hiring [Remote]', '[Remote]'), true);
});

test('quantifier characters: a keyword of "?", "*", or "+" does not throw', () => {
  assert.doesNotThrow(() => KeywordMatching.containsKeyword('rate this 5*', '*'));
  assert.doesNotThrow(() => KeywordMatching.containsKeyword('are you sure?', '?'));
  assert.doesNotThrow(() => KeywordMatching.containsKeyword('Google+ profile', '+'));
});

test('Google+: matches literal text and does not throw', () => {
  assert.doesNotThrow(() => KeywordMatching.containsKeyword('Check out our Google+ profile', 'Google+'));
  assert.equal(KeywordMatching.containsKeyword('Check out our Google+ profile', 'Google+'), true);
});

// ---------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------

test('empty keyword does not match everything', () => {
  assert.equal(KeywordMatching.containsKeyword('any text at all', ''), false);
});

test('whitespace-only keyword does not match everything', () => {
  assert.equal(KeywordMatching.containsKeyword('any text at all', '   '), false);
});

test('empty text never matches a non-empty keyword', () => {
  assert.equal(KeywordMatching.containsKeyword('', 'manager'), false);
});

test('keyword consisting entirely of punctuation does not crash', () => {
  assert.doesNotThrow(() => KeywordMatching.containsKeyword('!!! urgent hire !!!', '!!!'));
  assert.equal(KeywordMatching.containsKeyword('!!! urgent hire !!!', '!!!'), true);
});
