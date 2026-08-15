// Shared, dependency-free CSV parsing utility for the popup's CSV
// import. Loaded as a plain classic script in the popup page (via a
// <script> tag in popup.html, before popup.js - CSV import/export only
// happens there, so this is not loaded as a content script) and
// requireable from Node for the regression tests in
// test/csv-utils.test.js.
//
// Fixes: the previous importer did `text.split('\n')` before any
// quote-aware parsing, so a quoted field containing an embedded
// newline (legal CSV, and something this extension's own exports can
// produce - e.g. a scraped company name with embedded line breaks)
// was torn into multiple broken physical "rows" that could never be
// reconstructed correctly. This parser is quote-aware across the
// entire file text from the start, so logical row boundaries are only
// ever recognized outside of quotes.

const CsvUtils = {
  // Parses full CSV text into an array of rows, each an array of
  // field strings (already unescaped/unquoted).
  //
  // Dialect matched to what this extension's own exportToCSV()
  // produces: comma-separated, every field double-quoted, embedded
  // double-quotes escaped as "" while inside a quoted field. A `"`
  // character toggles quote mode wherever it appears (not just at a
  // field's start) - this mirrors this extension's prior
  // parseCSVLine() behavior and is sufficient for the dialect this
  // extension actually writes; it is not a full RFC 4180 validator.
  //
  // Row separators: CRLF ("\r\n") and lone LF ("\n") both end a row
  // when outside quotes. A lone "\r" outside quotes also ends a row
  // (defensive, for old-style external files). Embedded CRLF/CR
  // *inside* a quoted field is normalized to a single "\n" so stored
  // field content never contains a literal "\r"; embedded LF inside
  // quotes is preserved exactly as-is.
  //
  // A trailing newline at end of file does not produce an extra empty
  // row. An unmatched (unterminated) quote consumes the rest of the
  // file as literal field content rather than throwing; the resulting
  // row will almost always end up with far too few columns and gets
  // filtered out by the caller's existing column-count check, the
  // same "skip malformed rows" philosophy already used for import.
  parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    const source = String(text);

    for (let i = 0; i < source.length; i++) {
      const char = source[i];

      if (inQuotes) {
        if (char === '"') {
          if (source[i + 1] === '"') {
            field += '"';
            i++; // consume the escaped quote pair
          } else {
            inQuotes = false;
          }
        } else if (char === '\r') {
          field += '\n';
          if (source[i + 1] === '\n') i++; // consume paired LF of a CRLF
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\r' || char === '\n') {
        if (char === '\r' && source[i + 1] === '\n') i++; // consume paired LF
        row.push(field);
        rows.push(row);
        field = '';
        row = [];
      } else {
        field += char;
      }
    }

    // Flush a trailing field/row for files with no final newline.
    if (field !== '' || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }
};

// Popup-page context: classic script, shared `window`.
if (typeof window !== 'undefined') {
  window.CsvUtils = CsvUtils;
}

// Node context: used by test/csv-utils.test.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CsvUtils;
}
