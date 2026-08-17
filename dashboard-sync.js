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
const DASHBOARD_PING_PATH = '/api/extension/ping';

// Validates the connection, normalizes the URL, and issues one
// Authorization-bearing request to the dashboard - the piece syncJob()
// and testConnection() share. Never throws: resolves either
// { ok: true, response } or { ok: false, reason } for anything that
// keeps the request from completing (unconfigured, bad URL, network
// failure). An HTTP error response (4xx/5xx) is NOT a failure at this
// level - callers get the raw response back to interpret, since
// "unauthorized" means something different for a sync than for a
// connection test. Never logs `connection` or its token.
async function authenticatedDashboardFetch(connection, path, init) {
  if (!connection || !connection.dashboardUrl || !connection.token) {
    return { ok: false, reason: 'not-configured' };
  }

  const origin = DashboardSync.normalizeDashboardUrl(connection.dashboardUrl);
  if (!origin) {
    return { ok: false, reason: 'invalid-url' };
  }

  try {
    const response = await fetch(origin + path, {
      ...init,
      headers: {
        'Authorization': `Bearer ${connection.token}`,
        ...(init && init.headers),
      },
    });
    return { ok: true, response };
  } catch (error) {
    return { ok: false, reason: 'network-error' };
  }
}

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
  // sent; the one it still doesn't (description) is simply omitted
  // rather than guessed at. The string metadata fields below are sent
  // as-is (possibly '') - the backend already normalizes blank/
  // whitespace strings to null, the same way it already does for
  // location. postedAgeDays defaults to null and reposted to false
  // when a jobData object predates this field (e.g. a job saved by an
  // older version of the extension) - never a guessed value.
  buildSyncPayload(jobData) {
    return {
      source: jobData.source,
      sourceJobId: jobData.jobId || null,
      title: jobData.title,
      company: jobData.company,
      location: jobData.location,
      url: jobData.url,
      workplaceType: jobData.workplaceType,
      employmentType: jobData.employmentType,
      salaryText: jobData.salaryText,
      applicantSignal: jobData.applicantSignal,
      promoted: !!jobData.promoted,
      applicationHandling: jobData.applicationHandling,
      postedAgeDays: jobData.postedAgeDays != null ? jobData.postedAgeDays : null,
      reposted: !!jobData.reposted,
      sourceSavedAt: jobData.dateSaved || new Date().toISOString(),
    };
  },

  // Sends one job to the dashboard. Never throws - always resolves to
  // { ok: true } or { ok: false, reason } - so a dashboard/network
  // failure can never break the caller's local-save flow.
  async syncJob(connection, jobData) {
    const result = await authenticatedDashboardFetch(connection, DASHBOARD_SYNC_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(DashboardSync.buildSyncPayload(jobData)),
    });

    if (!result.ok) return result;

    if (!result.response.ok) {
      return { ok: false, reason: 'http-error', status: result.response.status };
    }

    return { ok: true };
  },

  // Calls the harmless GET /api/extension/ping endpoint with the
  // stored connection, for Settings' "Test Connection" control. Makes
  // no job-related requests and causes no data mutation beyond what
  // the backend's own token last-used tracking already does. Never
  // throws - always resolves { ok: true, email? } or
  // { ok: false, reason }, distinguishing:
  //   'not-configured' - no connection saved yet
  //   'invalid-url'    - saved Dashboard URL doesn't parse as http(s)
  //   'network-error'  - dashboard unreachable (DNS/connection/timeout)
  //   'unauthorized'   - token missing/invalid/revoked (HTTP 401)
  //   'http-error'     - any other non-2xx response
  async testConnection(connection) {
    const result = await authenticatedDashboardFetch(connection, DASHBOARD_PING_PATH, {
      method: 'GET',
    });

    if (!result.ok) return result;

    const response = result.response;

    if (response.status === 401) {
      return { ok: false, reason: 'unauthorized' };
    }

    if (!response.ok) {
      return { ok: false, reason: 'http-error', status: response.status };
    }

    let body = null;
    try {
      body = await response.json();
    } catch (error) {
      // 2xx with an unparseable body still means the endpoint is
      // reachable and the token worked - treat it as success without
      // an email rather than a failure.
    }

    return { ok: true, email: (body && body.email) || undefined };
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
