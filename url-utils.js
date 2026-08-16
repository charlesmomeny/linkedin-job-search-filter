// Shared, dependency-free URL-safety helper for job links. Loaded as a
// plain classic script in the popup page (via a <script> tag in
// popup.html, before popup.js), the options page (before options.js,
// for the Dashboard Sync URL field), and the background service worker
// (via importScripts(), for dashboard-sync.js) - and requireable from
// Node for the regression tests in test/url-utils.test.js.
//
// job.url is a trust-boundary value: when written by the content
// script (site-adapters.js) it is always window.location.href on a
// page the browser actually navigated to, so it can never be anything
// but http(s). But job.url can also arrive via CSV import - a file the
// user picks from disk, not something this extension controls - and a
// crafted row could put a "javascript:", "data:", or other dangerous
// scheme in the URL column. If that value were assigned straight to an
// <a href>, clicking the resulting link would execute script inside
// the popup page, which runs with this extension's storage/messaging
// privileges.
//
// isSafeJobUrl() is the single choke point both CSV import and popup
// rendering use, so an unsafe value can never become an actionable
// link regardless of which path it came from (including jobs saved by
// an earlier, pre-fix version of the importer).

const UrlUtils = {
  ALLOWED_PROTOCOLS: ['http:', 'https:'],

  // True only for a well-formed absolute URL using an explicitly
  // allowed scheme (http/https). Anything else - javascript:, data:,
  // file:, chrome:, chrome-extension:, vbscript:, blank/whitespace-only
  // input, or text that isn't a valid URL at all - is rejected. Uses
  // the platform URL parser rather than a regex, but still checks the
  // parsed protocol against an explicit allowlist (a URL being
  // "parseable" is not enough on its own).
  isSafeJobUrl(url) {
    if (typeof url !== 'string') return false;

    const trimmed = url.trim();
    if (!trimmed) return false;

    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch (error) {
      return false;
    }

    return this.ALLOWED_PROTOCOLS.includes(parsed.protocol);
  }
};

// Browser-like contexts: classic script, shared global. `globalThis`
// (rather than `window`) so this also works from the background service
// worker via importScripts(), which has `self` but no `window`.
if (typeof globalThis !== 'undefined') {
  globalThis.UrlUtils = UrlUtils;
}

// Node context: used by test/url-utils.test.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UrlUtils;
}
