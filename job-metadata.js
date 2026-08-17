// Shared, dependency-free helper for extracting LinkedIn's job-detail
// "pills row" (workplace type / employment type / salary) and the
// separate applicant-signal/promoted/application-handling text that
// lives in the same top-card area as location - see job-location.js.
// Loaded as a plain classic script in the content-script context (via
// manifest.json) and requireable from Node for
// test/job-metadata.test.js.
//
// Confirmed live across several real LinkedIn job-detail pages
// (/jobs/view/<id>) that these pieces of text are frequently glued
// together with NO separating whitespace or delimiter when LinkedIn
// renders them - e.g. one real posting's top-card text read exactly:
//   "New York, NY · 3 weeks ago · Over 100 people clicked applyPromoted by hirer · Responses managed off LinkedIn"
// and a separate pills-row child read:
//   "$90K/yr - $115K/yrOn-siteFull-time"
// (in other real postings the same pills row instead has each pill on
// its own line - formatting is not consistent). Because of this,
// every helper below extracts a known fixed phrase/pattern by direct
// regex/substring match rather than splitting on a delimiter or
// assuming a fixed position - the same lesson job-freshness.js's
// glued-text regression ("...Reposted2w...") already documented.
//
// Also confirmed live: a "Promoted by hirer" line can instead be
// followed by "Actively reviewing applicants" (a distinct, unrelated
// recruiter-activity badge) rather than "Responses managed off
// LinkedIn" - parseStatusText() only ever reports the latter as
// applicationHandling, never guessing from whatever happens to follow
// "Promoted by hirer".

const JobMetadata = {
  // Recognized values LinkedIn currently uses for these two pills.
  // Matched as plain substrings (not word-bounded) since adjacent
  // pills can be glued together with no separator - see file header.
  WORKPLACE_TYPES: ['Remote', 'Hybrid', 'On-site'],
  EMPLOYMENT_TYPES: ['Full-time', 'Part-time', 'Contract', 'Temporary', 'Internship', 'Volunteer', 'Other'],

  // A LinkedIn salary pill, e.g. "$90K/yr - $115K/yr" or "$216K/yr".
  // Matched directly so it never swallows an adjacent glued pill (the
  // pattern simply stops at the first character - e.g. the "O" of
  // "On-site" - that isn't part of a dollar amount).
  SALARY_PATTERN: /\$[\d,.]+[KkMm]?(?:\/(?:yr|hr|mo|year|hour|month))?(?:\s*-\s*\$[\d,.]+[KkMm]?(?:\/(?:yr|hr|mo|year|hour|month))?)?/,

  // LinkedIn's two confirmed applicant-signal phrasings. Checked in
  // this order since "clicked apply" is the more specific pattern.
  APPLICANT_CLICKED_PATTERN: /(?:[Oo]ver\s+)?\d[\d,]*\+?\s+people\s+clicked\s+apply/,
  APPLICANT_COUNT_PATTERN: /(?:[Oo]ver\s+)?\d[\d,]*\+?\s+applicants?/,

  // Fixed LinkedIn literals - like "reposted" in job-freshness.js,
  // these are site-controlled known labels, not arbitrary user text,
  // so a plain substring check is intentional and safe here.
  PROMOTED_TEXT: 'Promoted by hirer',
  APPLICATION_HANDLING_TEXT: 'Responses managed off LinkedIn',

  // Given one candidate line/child's text from the top-card area,
  // extracts whatever of workplaceType/employmentType/salaryText it
  // contains. Returns null for anything not found - never guesses.
  parsePillsText(text) {
    if (typeof text !== 'string') {
      return { workplaceType: null, employmentType: null, salaryText: null };
    }

    const workplaceType = this.WORKPLACE_TYPES.find((label) => text.includes(label)) || null;
    const employmentType = this.EMPLOYMENT_TYPES.find((label) => text.includes(label)) || null;
    const salaryMatch = text.match(this.SALARY_PATTERN);
    const salaryText = salaryMatch ? salaryMatch[0] : null;

    return { workplaceType, employmentType, salaryText };
  },

  // Given one candidate line/child's text from the top-card area,
  // extracts the applicant/clicked-apply signal (LinkedIn's exact
  // wording preserved verbatim - phrasing varies), whether the
  // posting is promoted, and the application-handling note when
  // present.
  parseStatusText(text) {
    if (typeof text !== 'string') {
      return { applicantSignal: null, promoted: false, applicationHandling: null };
    }

    const clickedMatch = text.match(this.APPLICANT_CLICKED_PATTERN);
    const countMatch = clickedMatch ? null : text.match(this.APPLICANT_COUNT_PATTERN);
    const applicantSignal = (clickedMatch && clickedMatch[0]) || (countMatch && countMatch[0]) || null;

    const promoted = text.includes(this.PROMOTED_TEXT);
    const applicationHandling = text.includes(this.APPLICATION_HANDLING_TEXT)
      ? this.APPLICATION_HANDLING_TEXT
      : null;

    return { applicantSignal, promoted, applicationHandling };
  },
};

// Content-script context: classic script, shared `window`.
if (typeof window !== 'undefined') {
  window.JobMetadata = JobMetadata;
}

// Node context: used by test/job-metadata.test.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JobMetadata;
}
