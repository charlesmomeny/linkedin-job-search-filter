// Regression tests for csv-utils.js — the fix for the CSV importer
// tearing quoted multiline fields into multiple broken rows because it
// split the whole file on "\n" before any quote-aware parsing ran.
//
// Plain Node, built-in test runner only (no package manager, no
// third-party framework). Run with: node --test test/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const CsvUtils = require('../csv-utils.js');

// ---------------------------------------------------------------------
// Basic row
// ---------------------------------------------------------------------

test('basic row: a normal exported-style row parses correctly', () => {
  const csv = 'Title,Company,Location,Source,URL,Date Saved\n' +
    '"Program Manager","Google","Mountain View","LinkedIn","https://example.com/1","2026-01-01T00:00:00.000Z"';
  const rows = CsvUtils.parseCSV(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], [
    'Program Manager', 'Google', 'Mountain View', 'LinkedIn',
    'https://example.com/1', '2026-01-01T00:00:00.000Z'
  ]);
});

// ---------------------------------------------------------------------
// Multiple rows
// ---------------------------------------------------------------------

test('multiple rows: two or more records parse independently', () => {
  const csv =
    '"A","Co1","Loc1","LinkedIn","https://x/1","d1"\n' +
    '"B","Co2","Loc2","Built In","https://x/2","d2"\n' +
    '"C","Co3","Loc3","LinkedIn","https://x/3","d3"';
  const rows = CsvUtils.parseCSV(csv);
  assert.equal(rows.length, 3);
  assert.equal(rows[0][0], 'A');
  assert.equal(rows[1][0], 'B');
  assert.equal(rows[2][0], 'C');
});

// ---------------------------------------------------------------------
// Comma inside quoted value
// ---------------------------------------------------------------------

test('comma inside quotes stays part of one field', () => {
  const csv = '"Program Manager","Example, Inc.","New York, NY","LinkedIn","https://x","d"';
  const rows = CsvUtils.parseCSV(csv);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], [
    'Program Manager', 'Example, Inc.', 'New York, NY', 'LinkedIn', 'https://x', 'd'
  ]);
});

// ---------------------------------------------------------------------
// Escaped quote
// ---------------------------------------------------------------------

test('escaped double quotes ("") produce a single literal quote', () => {
  const csv = '"Director","Example ""Enterprise"" Division","Remote","LinkedIn","https://x","d"';
  const rows = CsvUtils.parseCSV(csv);
  assert.equal(rows[0][1], 'Example "Enterprise" Division');
});

// ---------------------------------------------------------------------
// Embedded LF newline
// ---------------------------------------------------------------------

test('embedded LF newline inside a quoted field stays within one row', () => {
  const csv = '"Program Manager","Example Company\nTechnology Division","Remote","LinkedIn","https://x","d"\n' +
    '"Next Row Title","NextCo","Loc","LinkedIn","https://y","d2"';
  const rows = CsvUtils.parseCSV(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][1], 'Example Company\nTechnology Division');
  assert.equal(rows[1][0], 'Next Row Title');
});

// ---------------------------------------------------------------------
// Embedded CRLF newline
// ---------------------------------------------------------------------

test('embedded CRLF inside a quoted field stays within one row, normalized to LF', () => {
  const csv = '"Program Manager","Example Company\r\nTechnology Division","Remote","LinkedIn","https://x","d"\n' +
    '"Next Row Title","NextCo","Loc","LinkedIn","https://y","d2"';
  const rows = CsvUtils.parseCSV(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][1], 'Example Company\nTechnology Division');
  assert.ok(!rows[0][1].includes('\r'), 'embedded CR must be normalized away');
});

// ---------------------------------------------------------------------
// Mixed row separators (CRLF between records)
// ---------------------------------------------------------------------

test('mixed row separators: CRLF-terminated external file parses correctly', () => {
  const csv = '"A","Co1","Loc1","LinkedIn","https://x/1","d1"\r\n' +
    '"B","Co2","Loc2","Built In","https://x/2","d2"\r\n';
  const rows = CsvUtils.parseCSV(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][0], 'A');
  assert.equal(rows[1][0], 'B');
});

// ---------------------------------------------------------------------
// Trailing newline
// ---------------------------------------------------------------------

test('a trailing newline at end of file does not produce an extra empty row', () => {
  const csv = '"A","Co1","Loc1","LinkedIn","https://x/1","d1"\n';
  const rows = CsvUtils.parseCSV(csv);
  assert.equal(rows.length, 1);
});

test('a file with no trailing newline still parses its last row', () => {
  const csv = '"A","Co1","Loc1","LinkedIn","https://x/1","d1"';
  const rows = CsvUtils.parseCSV(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], 'A');
});

// ---------------------------------------------------------------------
// Empty fields
// ---------------------------------------------------------------------

test('quoted empty field parses as an empty string', () => {
  const rows = CsvUtils.parseCSV('"A","","C"');
  assert.deepEqual(rows[0], ['A', '', 'C']);
});

test('unquoted empty field parses as an empty string', () => {
  const rows = CsvUtils.parseCSV('A,,C');
  assert.deepEqual(rows[0], ['A', '', 'C']);
});

// ---------------------------------------------------------------------
// Historical real-world shape (synthetic fixture only — not real user data)
// ---------------------------------------------------------------------

test('synthetic Built-In-shaped multiline company field survives as one field/row', () => {
  const syntheticCompany = 'Example Company\nSoftware • Technology\nNew York, NY\n450 Employees';
  const csv =
    '"Senior Program Manager","' + syntheticCompany.replace(/"/g, '""') + '","","Built In","https://example.com/job/999999","2026-01-01T00:00:00.000Z"\n' +
    '"Next Job Title","Next Co","Remote","LinkedIn","https://example.com/job/2","2026-01-02T00:00:00.000Z"';

  const rows = CsvUtils.parseCSV(csv);
  assert.equal(rows.length, 2, 'the multiline company field must not split its row into extra rows');
  assert.equal(rows[0][1], syntheticCompany);
  assert.equal(rows[0][3], 'Built In');
  assert.equal(rows[1][0], 'Next Job Title');
});

// ---------------------------------------------------------------------
// Malformed unmatched quote
// ---------------------------------------------------------------------

test('unmatched quote at end of file does not throw, and yields a too-short row', () => {
  const csv = '"Program Manager,Google,Remote';
  let rows;
  assert.doesNotThrow(() => { rows = CsvUtils.parseCSV(csv); });
  assert.equal(rows.length, 1);
  // The unterminated quote swallows the rest of the file as one field,
  // so this row has far fewer than the 6 columns a valid record needs -
  // the caller's existing column-count check filters rows like this out.
  assert.ok(rows[0].length < 6);
});

test('completely empty file produces zero rows', () => {
  const rows = CsvUtils.parseCSV('');
  assert.deepEqual(rows, []);
});
