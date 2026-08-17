// Shared, dependency-free helper for extracting a job's location from
// LinkedIn's job-detail top card. Loaded as a plain classic script in
// the content-script context (via manifest.json) and requireable from
// Node for the regression tests in test/job-location.test.js.
//
// LinkedIn's current job-detail markup uses generated/hashed class
// names throughout (confirmed live across several real postings -
// OpenAI, Microsoft, LinkedIn itself, and others - navigating directly
// to /jobs/view/<id>). There is no stable class or data-attribute for
// "this is the location" the way older selectors like
// [class*="location"] assumed; those now simply match nothing, which
// is why a job like "San Francisco, CA" was extracted as blank.
//
// What IS stable is the *content pattern*: the top card renders one
// line as "<location> · <posted age> · <applicant signal>" (e.g.
// "San Francisco, CA · 1 week ago · Over 100 people clicked apply"),
// immediately below the title, and above a separate, optional
// "Promoted by hirer · Responses managed off LinkedIn" line that uses
// the same " · " separator. parseLocationLine() picks the location out
// of one candidate line; site-adapters.js is responsible for finding
// the right line to hand it (see extractJobData()).

const JobLocation = {
  // Given one line of text from the top-card area, returns the
  // location if this looks like LinkedIn's "location · posted age ·
  // applicant signal" line, or null if it doesn't match - e.g. the
  // "Promoted by hirer · ..." line, or unrelated text. Never guesses:
  // a non-matching line means "not this line", not "location unknown".
  parseLocationLine(text) {
    if (typeof text !== 'string') return null;

    const trimmed = text.trim();
    if (!trimmed.includes(' · ')) return null;

    // Same " · " separator, different line - must never be mistaken
    // for the location.
    if (/^(Promoted|Responses)\b/i.test(trimmed)) return null;

    const location = trimmed.split(' · ')[0].trim();
    return location.length > 0 ? location : null;
  }
};

// Content-script context: classic script, shared `window`.
if (typeof window !== 'undefined') {
  window.JobLocation = JobLocation;
}

// Node context: used by test/job-location.test.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JobLocation;
}
