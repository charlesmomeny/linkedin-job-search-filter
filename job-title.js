// Shared, dependency-free helper for finding the job title on a
// LinkedIn job-detail page (standalone /jobs/view/<id> and the split
// search+detail view). Loaded as a plain classic script in the
// content-script context (via manifest.json) and requireable from Node
// for test/job-title.test.js.
//
// Root cause this fixes: site-adapters.js's extractJobData() used to
// take the FIRST <h1> on the page (then the first <h2>) as the title.
// LinkedIn's global nav renders a visually hidden heading carrying the
// notification count ("1 notification", "0 notifications total"), and
// when that heading precedes the job's own <h1> in document order it
// was saved - and synced to the dashboard - as the job's title.
//
// Confirmed live (Oct 2026): LinkedIn's current /jobs/view/<id> page
// renders NO <h1> at all - the title is a plain <div> with hashed class
// names, the next sibling after the company-name block - and the only
// early heading is an <h2> reading "0 notifications". So the old logic
// didn't just occasionally pick the wrong heading, it had nothing
// right to pick.
//
// Strategy, in order (first acceptable candidate wins):
//   1. Known job-title containers from LinkedIn's top card (older and
//      guest/public layouts).
//   2. The page's own <title>, "<job title> | <company> | LinkedIn" -
//      used only when its company segment matches the company link's
//      text, so a search page's title ("software engineer Jobs |
//      LinkedIn") can never be mistaken for a job title. The matching
//      element in the top card is located too when present.
//   3. An <h1> near the job's company link, searching outward a few
//      ancestors (older logged-in layouts). Never an <h2>: those are
//      section headings on the current layout.
//   4. The element right after the company-name block (current layout;
//      also covers the split search+detail view, whose page <title>
//      describes the search, not the job).
//   5. Any remaining <h1> outside the site header/nav and screen-reader
//      text.
// Every candidate must also pass isPlaceholderTitle() and
// isAcceptable(). If nothing qualifies the title stays empty - never
// guessed.

const JobTitle = {
  // Whole-string notification/message counters only - never a real
  // title that merely contains one of these words. Mirrors
  // job-saver-web's lib/utils/job-title.ts, which rejects the same
  // titles at the sync API.
  PLACEHOLDER_TITLE_PATTERN:
    /^\(?\d+\+?\)?\s+(?:new\s+|unread\s+)?(?:notifications?|messages?)(?:\s+total)?$|^(?:notifications?|messages?)$/i,

  TITLE_SELECTORS: [
    '.job-details-jobs-unified-top-card__job-title h1',
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title',
    '.top-card-layout__title',
    '.topcard__title'
  ],

  EXCLUDED_CONTAINERS: 'header, nav, [role="navigation"], #global-nav, .global-nav, .visually-hidden, .a11y-text, .sr-only',

  COMPANY_ANCESTOR_LIMIT: 6,

  normalize(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  },

  isPlaceholderTitle(text) {
    return this.PLACEHOLDER_TITLE_PATTERN.test(this.normalize(text));
  },

  isAcceptable(element) {
    if (!element) return false;
    const text = this.normalize(element.textContent);
    if (!text || this.isPlaceholderTitle(text)) return false;
    return !element.closest(this.EXCLUDED_CONTAINERS);
  },

  // Repair rule for an already-saved job whose stored title is a
  // notification counter (saved before this fix): returns the freshly
  // extracted title to replace it with, or null to leave the record
  // alone. Only ever replaces a stored placeholder - never a real title
  // the user already has, and never with an empty/placeholder value.
  // Used only on an explicit Save click on that same job's page (see
  // content-universal.js's saveCurrentJob()).
  repairedTitle(storedTitle, extractedTitle) {
    if (!this.isPlaceholderTitle(storedTitle)) return null;
    const replacement = this.normalize(extractedTitle);
    if (!replacement || this.isPlaceholderTitle(replacement)) return null;
    return replacement;
  },

  // Pure: the job title from a "<title> | <company> | LinkedIn" page
  // title, or null. Strips LinkedIn's "(3) " unread-count prefix.
  titleFromDocumentTitle(documentTitle, companyName) {
    const company = this.normalize(companyName).toLowerCase();
    if (!company) return null;
    const parts = this.normalize(documentTitle).replace(/^\(\d+\+?\)\s*/, '').split(' | ');
    if (parts.length < 3 || parts[parts.length - 1] !== 'LinkedIn') return null;
    if (parts[1].toLowerCase() !== company) return null;
    const title = parts[0];
    return title && !this.isPlaceholderTitle(title) ? title : null;
  },

  ancestorsOf(element, limit) {
    const out = [];
    for (let current = element ? element.parentElement : null; current && out.length < limit; current = current.parentElement) {
      out.push(current);
    }
    return out;
  },

  // Returns { text, element } - element may be null when only the page
  // <title> identified the job title. Both empty/null when nothing
  // qualifies.
  findTitle(doc, companyLink) {
    const found = (element) => ({ text: this.normalize(element.textContent), element });

    for (const selector of this.TITLE_SELECTORS) {
      const element = doc.querySelector(selector);
      if (this.isAcceptable(element)) return found(element);
    }

    const ancestors = this.ancestorsOf(companyLink, this.COMPANY_ANCESTOR_LIMIT);

    const fromDocTitle = companyLink ? this.titleFromDocumentTitle(doc.title, companyLink.textContent) : null;
    if (fromDocTitle) {
      const matches = (element) => this.normalize(element.textContent) === fromDocTitle;
      for (const ancestor of ancestors) {
        for (const element of ancestor.querySelectorAll('*')) {
          // Deepest element carrying exactly the title text.
          if (matches(element) && ![...element.children].some(matches)) return { text: fromDocTitle, element };
        }
      }
      return { text: fromDocTitle, element: null };
    }

    // <h1> only: <h2>s near the top card are section headings ("About
    // the job", "Use AI to assess how you fit"), never the title.
    for (const ancestor of ancestors) {
      for (const heading of ancestor.querySelectorAll('h1')) {
        if (this.isAcceptable(heading)) return found(heading);
      }
    }

    // The block holding the company link, then its next sibling - the
    // first ancestor level where that sibling is an acceptable,
    // title-shaped element (short, no "location · age · applicants"
    // separator).
    let block = companyLink;
    for (const ancestor of ancestors) {
      const next = block.nextElementSibling;
      if (next && this.isAcceptable(next)) {
        const text = this.normalize(next.textContent);
        if (text.length <= 200 && !text.includes('·')) return found(next);
      }
      block = ancestor;
    }

    for (const heading of doc.querySelectorAll('h1')) {
      if (this.isAcceptable(heading)) return found(heading);
    }

    return { text: '', element: null };
  }
};

// Content-script context: classic script, shared `window`.
if (typeof window !== 'undefined') {
  window.JobTitle = JobTitle;
}

// Node context: used by test/job-title.test.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JobTitle;
}
