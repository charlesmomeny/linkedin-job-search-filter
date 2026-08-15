// Shared, dependency-free literal keyword-matching helper for the
// filter engine. Loaded as a plain classic script in the content-script
// context (via manifest.json's content_scripts) and requireable from
// Node for the regression tests in test/keyword-matching.test.js.
//
// User-entered filter keywords (excludeTitles, excludeLocations,
// includeTitles, includeLocations) are plain text, not regex syntax.
// The previous containsKeyword() interpolated the raw keyword directly
// into `new RegExp(...)`, so a keyword containing regex metacharacters
// (e.g. "C++") could throw a SyntaxError and abort the whole filter
// pass - and even a keyword that happened to be valid regex syntax
// (e.g. "(Remote)") would be silently misinterpreted (parens as a
// capturing group) instead of matched literally.
//
// This treats every keyword as literal text while preserving
// whole-word matching for ordinary alphabetic terms. Not used by
// excludeAnywhere, which intentionally does plain substring matching
// (a separate, unrelated finding).

const KeywordMatching = {
  escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  isWordChar(ch) {
    return /[A-Za-z0-9_]/.test(ch);
  },

  // True if `keyword` appears literally (case-insensitive) in `text`.
  //
  // A `\b` word boundary is required on a given side only when the
  // keyword's edge character on that side is itself a word character
  // ([A-Za-z0-9_]). This preserves whole-word matching for ordinary
  // terms - "manager" still matches "Manager" but not "managerial" -
  // while keywords that start or end in punctuation ("C++", "(Remote)")
  // match literally instead of requiring a boundary that a trailing or
  // leading punctuation character could never satisfy against normal
  // text (a plain `\bC\+\+\b` never matches "C++ Developer", since
  // neither "+" nor the following space is a word character).
  containsKeyword(text, keyword) {
    if (typeof text !== 'string' || typeof keyword !== 'string') return false;
    if (!keyword.trim()) return false; // no accidental match-everything for blank keywords

    const escaped = this.escapeRegExp(keyword);
    const left = this.isWordChar(keyword.charAt(0)) ? '\\b' : '';
    const right = this.isWordChar(keyword.charAt(keyword.length - 1)) ? '\\b' : '';

    const regex = new RegExp(left + escaped + right, 'i');
    return regex.test(text);
  }
};

// Content-script context: classic script, shared `window`.
if (typeof window !== 'undefined') {
  window.KeywordMatching = KeywordMatching;
}

// Node context: used by test/keyword-matching.test.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = KeywordMatching;
}
