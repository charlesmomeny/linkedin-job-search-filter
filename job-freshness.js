// Shared, dependency-free helpers for LinkedIn's "Reposted" and
// "posted X ago" card text. Loaded as a plain classic script in the
// content-script context (via manifest.json) and requireable from
// Node for the regression tests in test/job-freshness.test.js.
//
// LinkedIn job cards render this information as plain visible text on
// the card (confirmed live: cards already show text labels like
// "Promoted" / "Easy Apply" / "Viewed" directly in their text content,
// the same mechanism the existing salary/keyword filters already rely
// on via extractJobDataFromCard's `fullText`). There is no reliable,
// stable CSS class/data-attribute to hook for either signal given
// LinkedIn's frequently-changing, often-obfuscated markup, so - like
// the rest of this adapter's "best effort" LinkedIn handling - this
// works from card text directly rather than a specific selector.
//
// Both functions fail open: if the expected text isn't found (a card
// layout that doesn't include it, or a LinkedIn change this wasn't
// updated for), they report "not reposted" / "unknown age" rather than
// guessing, so a job is never hidden based on a false positive.

const JobFreshness = {
  // True if the card's text contains a "Reposted" label. LinkedIn
  // shows this as a plain visible badge/line on cards for listings
  // that have been reposted.
  isReposted(text) {
    if (typeof text !== 'string') return false;
    return /\breposted\b/i.test(text);
  },

  // Parses LinkedIn's relative "posted X ago" phrasing out of card
  // text into an approximate number of days. Returns null when no
  // recognizable pattern is found - callers must treat null as
  // "unknown", never as "0 days old".
  parsePostedDaysAgo(text) {
    if (typeof text !== 'string') return null;
    const lower = text.toLowerCase();

    if (/\bjust now\b/.test(lower)) return 0;
    if (/\byesterday\b/.test(lower)) return 1;

    // Full phrasing: "3 days ago", "1 week ago", "2 months ago", "1 year ago"
    let match = lower.match(/\b(\d+)\s*(minute|hour|day|week|month|year)s?\s+ago\b/);
    if (match) {
      return unitsToDays(parseInt(match[1], 10), match[2]);
    }

    // Abbreviated forms LinkedIn sometimes uses in compact layouts:
    // "3d", "2w", "1mo", "5h". Checked after the full-phrase pattern
    // so "3 days ago" is never misread by the shorter pattern.
    match = lower.match(/\b(\d+)\s*(mo|[hdwy])\b/);
    if (match) {
      const unit = match[2] === 'mo' ? 'month'
        : match[2] === 'h' ? 'hour'
        : match[2] === 'd' ? 'day'
        : match[2] === 'w' ? 'week'
        : 'year';
      return unitsToDays(parseInt(match[1], 10), unit);
    }

    return null;
  }
};

function unitsToDays(amount, unit) {
  const daysPerUnit = {
    minute: 1 / 1440,
    hour: 1 / 24,
    day: 1,
    week: 7,
    month: 30,
    year: 365
  };
  return Math.round(amount * (daysPerUnit[unit] || 0));
}

// Content-script context: classic script, shared `window`.
if (typeof window !== 'undefined') {
  window.JobFreshness = JobFreshness;
}

// Node context: used by test/job-freshness.test.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JobFreshness;
}
