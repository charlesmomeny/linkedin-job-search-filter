// Shared, dependency-free helper for detecting whether a job's location
// text names a specific, unambiguous US state, and whether that state is
// currently allowed. Loaded as a plain classic script in the
// content-script context (via manifest.json) and requireable from Node
// for the regression tests in test/us-location.test.js.
//
// Root cause this addresses: excludeLocations (content-universal.js's
// evaluateJobCard()) is a flat, user-maintained blocklist matched with
// whole-word matching across the ENTIRE card text
// (KeywordMatching.containsKeyword against fullText). Expressing "hide
// every US state except CA" that way means hand-enumerating every state,
// and several 2-letter state codes - IN, OR, HI, ME, OK - are also
// common English words, so a naive whole-text whole-word search for them
// would false-positive on ordinary prose ("...interested IN this
// role...") once matched case-insensitively.
//
// This module instead looks for a state token ONLY where a LinkedIn
// location actually renders one: the trailing "<City>, XX" or "<City>,
// XX (Hybrid)"/"(Remote)" segment, or a "<State>, United States" segment
// for state-only/remote-eligible postings. The two-letter form must
// appear in the ORIGINAL (non-lowercased) text as exactly two uppercase
// letters right before end-of-line/an optional trailing parenthetical -
// real postings always render state codes that way - which is what
// keeps "in"/"or"/"hi" appearing in ordinary sentences from ever being
// read as a state code.
//
// A bare "United States" (or "United States (Remote)") with no state
// named is deliberately NOT treated as a match - that's an
// unspecified-location remote posting, not "explicitly located in
// another state".

const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia'
};

const NAME_TO_ABBR = Object.fromEntries(
  Object.entries(US_STATES).map(([abbr, name]) => [name.toLowerCase(), abbr])
);

const UsLocation = {
  US_STATES,

  // Given the RAW (not lowercased) card text, with lines separated by
  // '\n' (CardTextExtraction's contract - see card-text-extraction.js),
  // returns { abbr, name } for the first line that names a specific US
  // state, or null if none does.
  detectState(rawText) {
    if (typeof rawText !== 'string') return null;

    const lines = rawText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      // "<City>, XX" / "<City>, XX (Hybrid)" - exactly two uppercase
      // letters immediately before an optional trailing parenthetical,
      // so this can never match ordinary lowercase prose.
      const abbrMatch = trimmed.match(/,\s*([A-Z]{2})\s*(?:\([^)]*\))?\s*$/);
      if (abbrMatch && US_STATES[abbrMatch[1]]) {
        return { abbr: abbrMatch[1], name: US_STATES[abbrMatch[1]] };
      }

      // "<State Name>, United States" - state-only postings with no
      // city (e.g. "Indiana, United States").
      const nameMatch = trimmed.match(/^(.+?),\s*United States\s*(?:\([^)]*\))?\s*$/i);
      if (nameMatch) {
        const abbr = NAME_TO_ABBR[nameMatch[1].trim().toLowerCase()];
        if (abbr) return { abbr, name: US_STATES[abbr] };
      }
    }

    return null;
  },

  // True if `state` ({ abbr, name } from detectState) is in the
  // configured allow-list. Matches case-insensitively against either the
  // abbreviation or the full name, so a user can type "CA" or
  // "California" in Settings. `state` of null (no specific state
  // detected) is always allowed - there's nothing to restrict.
  isAllowed(state, allowedStates) {
    if (!state) return true;
    const allowed = Array.isArray(allowedStates) ? allowedStates : [];
    return allowed.some((entry) => {
      if (typeof entry !== 'string') return false;
      const normalized = entry.trim().toLowerCase();
      return normalized === state.abbr.toLowerCase() || normalized === state.name.toLowerCase();
    });
  }
};

// Content-script context: classic script, shared `window`.
if (typeof window !== 'undefined') {
  window.UsLocation = UsLocation;
}

// Node context: used by test/us-location.test.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UsLocation;
}
