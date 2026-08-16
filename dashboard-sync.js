// Centralizes all network communication with the optional Job Saver web
// dashboard. Used only from background.js (the service worker) - never
// from content scripts or the popup directly - so fetch/CORS logic for
// this integration lives in exactly one place instead of being spread
// across content-universal.js/popup.js.
//
// Loaded via importScripts() in the (classic, non-module) background
// service worker, and requireable from Node for
// test/dashboard-sync.test.js. UrlUtils must be loaded first in both
// contexts (background.js does this via importScripts too).

const DASHBOARD_SYNC_PATH = '/api/jobs/sync';

const DashboardSync = {
  // A user-entered Dashboard URL may include a path, trailing slash, or
  // stray whitespace. Only the origin (scheme + host [+ port]) is ever
  // used - normalizing here means storage always holds a clean value
  // and callers never need to repeat this logic. Returns null for
  // anything that isn't a well-formed http(s) URL (reuses the same
  // allowlist url-utils.js already enforces for job links).
  normalizeDashboardUrl(rawUrl) {
    if (typeof rawUrl !== 'string') return null;

    const trimmed = rawUrl.trim();
    if (!trimmed || !globalThis.UrlUtils.isSafeJobUrl(trimmed)) return null;

    try {
      return new URL(trimmed).origin;
    } catch (error) {
      return null;
    }
  },

  // Maps this extension's internal job-data shape (site-adapters.js's
  // extractJobData()) to job-saver-web's POST /api/jobs/sync payload
  // contract. Only fields the extension actually collects today are
  // sent; fields it doesn't collect (description, reposted,
  // postedAgeDays) are simply omitted rather than guessed at.
  buildSyncPayload(jobData) {
    return {
      source: jobData.source,
      sourceJobId: jobData.jobId || null,
      title: jobData.title,
      company: jobData.company,
      location: jobData.location,
      url: jobData.url,
      sourceSavedAt: jobData.dateSaved || new Date().toISOString(),
    };
  },

  // Sends one job to the dashboard. Never throws - always resolves to
  // { ok: true } or { ok: false, reason } - so a dashboard/network
  // failure can never break the caller's local-save flow. Never logs
  // `connection` or its token.
  async syncJob(connection, jobData) {
    if (!connection || !connection.dashboardUrl || !connection.token) {
      return { ok: false, reason: 'not-configured' };
    }

    const origin = DashboardSync.normalizeDashboardUrl(connection.dashboardUrl);
    if (!origin) {
      return { ok: false, reason: 'invalid-url' };
    }

    let response;
    try {
      response = await fetch(origin + DASHBOARD_SYNC_PATH, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${connection.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(DashboardSync.buildSyncPayload(jobData)),
      });
    } catch (error) {
      return { ok: false, reason: 'network-error' };
    }

    if (!response.ok) {
      return { ok: false, reason: 'http-error', status: response.status };
    }

    return { ok: true };
  },
};

// Service-worker context: importScripts() shares the worker's global.
// `globalThis` rather than `self`/`window` so this works everywhere
// (service worker, options/popup pages, Node) with one check.
if (typeof globalThis !== 'undefined') {
  globalThis.DashboardSync = DashboardSync;
}

// Node context: used by test/dashboard-sync.test.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DashboardSync;
}
