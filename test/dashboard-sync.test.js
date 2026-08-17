// Regression tests for dashboard-sync.js - the module that talks to the
// optional Job Saver web dashboard. Covers payload mapping, the
// no-connection-configured short circuit (must never call fetch),
// successful/failed sync, the Authorization header, malformed
// Dashboard URL handling, and the GET /api/extension/ping connection
// test (success, unauthorized, network error, not configured).
//
// Plain Node, built-in test runner only. Run with: node --test test/

const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../url-utils.js');
const DashboardSync = require('../dashboard-sync.js');

const VALID_CONNECTION = {
  dashboardUrl: 'https://dashboard.example.com',
  token: 'jsw_test-token-value',
};

const JOB_DATA = {
  url: 'https://www.linkedin.com/jobs/view/123456',
  jobId: '123456',
  title: 'Senior Engineer',
  company: 'Acme Corp',
  location: 'Remote',
  workplaceType: 'Remote',
  employmentType: 'Full-time',
  salaryText: '$150K/yr - $180K/yr',
  applicantSignal: '26 people clicked apply',
  promoted: true,
  applicationHandling: 'Responses managed off LinkedIn',
  postedAgeDays: 7,
  reposted: true,
  source: 'LinkedIn',
  dateSaved: '2026-08-16T00:00:00.000Z',
};

// ---------------------------------------------------------------------
// normalizeDashboardUrl
// ---------------------------------------------------------------------

test('normalizeDashboardUrl: strips a path/trailing slash down to the origin', () => {
  assert.equal(
    DashboardSync.normalizeDashboardUrl('https://dashboard.example.com/some/path/'),
    'https://dashboard.example.com',
  );
});

test('normalizeDashboardUrl: trims surrounding whitespace', () => {
  assert.equal(
    DashboardSync.normalizeDashboardUrl('  https://dashboard.example.com  '),
    'https://dashboard.example.com',
  );
});

test('normalizeDashboardUrl: rejects a javascript: URL', () => {
  assert.equal(DashboardSync.normalizeDashboardUrl('javascript:alert(1)'), null);
});

test('normalizeDashboardUrl: rejects malformed text', () => {
  assert.equal(DashboardSync.normalizeDashboardUrl('not a url'), null);
});

test('normalizeDashboardUrl: rejects an empty/non-string value', () => {
  assert.equal(DashboardSync.normalizeDashboardUrl(''), null);
  assert.equal(DashboardSync.normalizeDashboardUrl(undefined), null);
  assert.equal(DashboardSync.normalizeDashboardUrl(42), null);
});

// ---------------------------------------------------------------------
// buildSyncPayload
// ---------------------------------------------------------------------

test('buildSyncPayload: maps extractJobData()-shaped data to the backend contract', () => {
  const payload = DashboardSync.buildSyncPayload(JOB_DATA);

  assert.deepEqual(payload, {
    source: 'LinkedIn',
    sourceJobId: '123456',
    title: 'Senior Engineer',
    company: 'Acme Corp',
    location: 'Remote',
    url: 'https://www.linkedin.com/jobs/view/123456',
    workplaceType: 'Remote',
    employmentType: 'Full-time',
    salaryText: '$150K/yr - $180K/yr',
    applicantSignal: '26 people clicked apply',
    promoted: true,
    applicationHandling: 'Responses managed off LinkedIn',
    postedAgeDays: 7,
    reposted: true,
    sourceSavedAt: '2026-08-16T00:00:00.000Z',
  });
});

test('buildSyncPayload: maps a missing jobId to null sourceJobId, not a fabricated id', () => {
  const payload = DashboardSync.buildSyncPayload({ ...JOB_DATA, jobId: null });
  assert.equal(payload.sourceJobId, null);
});

test('buildSyncPayload: missing metadata fields (extractJobData()\'s empty-string convention) pass through as-is', () => {
  const payload = DashboardSync.buildSyncPayload({
    ...JOB_DATA,
    workplaceType: '',
    employmentType: '',
    salaryText: '',
    applicantSignal: '',
    promoted: false,
    applicationHandling: '',
  });

  assert.equal(payload.workplaceType, '');
  assert.equal(payload.employmentType, '');
  assert.equal(payload.salaryText, '');
  assert.equal(payload.applicantSignal, '');
  assert.equal(payload.promoted, false);
  assert.equal(payload.applicationHandling, '');
});

test('buildSyncPayload: promoted is always coerced to a real boolean', () => {
  assert.equal(DashboardSync.buildSyncPayload({ ...JOB_DATA, promoted: undefined }).promoted, false);
  assert.equal(DashboardSync.buildSyncPayload({ ...JOB_DATA, promoted: true }).promoted, true);
});

test('buildSyncPayload: includes postedAgeDays and reposted when extractJobData() found them', () => {
  const payload = DashboardSync.buildSyncPayload({ ...JOB_DATA, postedAgeDays: 3, reposted: true });
  assert.equal(payload.postedAgeDays, 3);
  assert.equal(payload.reposted, true);
});

test('buildSyncPayload: postedAgeDays is null and reposted is false when not found (fail open, no guessing)', () => {
  const payload = DashboardSync.buildSyncPayload({ ...JOB_DATA, postedAgeDays: null, reposted: false });
  assert.equal(payload.postedAgeDays, null);
  assert.equal(payload.reposted, false);
});

test('buildSyncPayload: postedAgeDays defaults to null and reposted to false for a jobData object that predates these fields', () => {
  const { postedAgeDays, reposted, ...legacyJobData } = JOB_DATA;
  void postedAgeDays;
  void reposted;

  const payload = DashboardSync.buildSyncPayload(legacyJobData);
  assert.equal(payload.postedAgeDays, null);
  assert.equal(payload.reposted, false);
});

test('buildSyncPayload: postedAgeDays of 0 (posted "just now") is preserved, not treated as missing', () => {
  const payload = DashboardSync.buildSyncPayload({ ...JOB_DATA, postedAgeDays: 0 });
  assert.equal(payload.postedAgeDays, 0);
});

// ---------------------------------------------------------------------
// syncJob
// ---------------------------------------------------------------------

function withMockedFetch(impl, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return impl(url, init);
  };
  return run(calls).finally(() => {
    globalThis.fetch = original;
  });
}

test('syncJob: no connection configured never calls fetch, resolves not-configured', async () => {
  await withMockedFetch(
    () => {
      throw new Error('fetch should not be called');
    },
    async (calls) => {
      const result = await DashboardSync.syncJob(null, JOB_DATA);
      assert.deepEqual(result, { ok: false, reason: 'not-configured' });
      assert.equal(calls.length, 0);
    },
  );
});

test('syncJob: a connection missing a token never calls fetch', async () => {
  await withMockedFetch(
    () => {
      throw new Error('fetch should not be called');
    },
    async (calls) => {
      const result = await DashboardSync.syncJob({ dashboardUrl: 'https://x.example.com' }, JOB_DATA);
      assert.deepEqual(result, { ok: false, reason: 'not-configured' });
      assert.equal(calls.length, 0);
    },
  );
});

test('syncJob: a malformed dashboard URL never calls fetch', async () => {
  await withMockedFetch(
    () => {
      throw new Error('fetch should not be called');
    },
    async (calls) => {
      const result = await DashboardSync.syncJob(
        { dashboardUrl: 'javascript:alert(1)', token: 'jsw_x' },
        JOB_DATA,
      );
      assert.deepEqual(result, { ok: false, reason: 'invalid-url' });
      assert.equal(calls.length, 0);
    },
  );
});

test('syncJob: a successful response resolves ok:true', async () => {
  await withMockedFetch(
    () => ({ ok: true, status: 200 }),
    async () => {
      const result = await DashboardSync.syncJob(VALID_CONNECTION, JOB_DATA);
      assert.deepEqual(result, { ok: true });
    },
  );
});

test('syncJob: an HTTP error response resolves ok:false without throwing', async () => {
  await withMockedFetch(
    () => ({ ok: false, status: 401 }),
    async () => {
      const result = await DashboardSync.syncJob(VALID_CONNECTION, JOB_DATA);
      assert.deepEqual(result, { ok: false, reason: 'http-error', status: 401 });
    },
  );
});

test('syncJob: a network failure (fetch throws) resolves ok:false, does not throw', async () => {
  await withMockedFetch(
    () => {
      throw new TypeError('Failed to fetch');
    },
    async () => {
      const result = await DashboardSync.syncJob(VALID_CONNECTION, JOB_DATA);
      assert.deepEqual(result, { ok: false, reason: 'network-error' });
    },
  );
});

test('syncJob: sends the correct method, URL, and Authorization/Content-Type headers', async () => {
  await withMockedFetch(
    () => ({ ok: true, status: 200 }),
    async (calls) => {
      await DashboardSync.syncJob(VALID_CONNECTION, JOB_DATA);

      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://dashboard.example.com/api/jobs/sync');
      assert.equal(calls[0].init.method, 'POST');
      assert.equal(calls[0].init.headers['Authorization'], `Bearer ${VALID_CONNECTION.token}`);
      assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    },
  );
});

test('syncJob: the request body is the mapped payload, not the raw connection/job object', async () => {
  await withMockedFetch(
    () => ({ ok: true, status: 200 }),
    async (calls) => {
      await DashboardSync.syncJob(VALID_CONNECTION, JOB_DATA);

      const body = JSON.parse(calls[0].init.body);
      assert.equal(body.title, JOB_DATA.title);
      assert.equal(body.sourceJobId, JOB_DATA.jobId);
      // The token must never end up in the body.
      assert.equal(JSON.stringify(body).includes(VALID_CONNECTION.token), false);
    },
  );
});

// ---------------------------------------------------------------------
// testConnection (Settings' "Test Connection" control)
// ---------------------------------------------------------------------

test('testConnection: no connection configured never calls fetch, resolves not-configured', async () => {
  await withMockedFetch(
    () => {
      throw new Error('fetch should not be called');
    },
    async (calls) => {
      const result = await DashboardSync.testConnection(null);
      assert.deepEqual(result, { ok: false, reason: 'not-configured' });
      assert.equal(calls.length, 0);
    },
  );
});

test('testConnection: a malformed dashboard URL never calls fetch', async () => {
  await withMockedFetch(
    () => {
      throw new Error('fetch should not be called');
    },
    async (calls) => {
      const result = await DashboardSync.testConnection({
        dashboardUrl: 'javascript:alert(1)',
        token: 'jsw_x',
      });
      assert.deepEqual(result, { ok: false, reason: 'invalid-url' });
      assert.equal(calls.length, 0);
    },
  );
});

test('testConnection: a 200 response with an email resolves ok:true with that email', async () => {
  await withMockedFetch(
    () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, email: 'user@example.com' }),
    }),
    async () => {
      const result = await DashboardSync.testConnection(VALID_CONNECTION);
      assert.deepEqual(result, { ok: true, email: 'user@example.com' });
    },
  );
});

test('testConnection: a 401 response resolves ok:false, reason unauthorized (invalid/revoked token)', async () => {
  await withMockedFetch(
    () => ({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) }),
    async () => {
      const result = await DashboardSync.testConnection(VALID_CONNECTION);
      assert.deepEqual(result, { ok: false, reason: 'unauthorized' });
    },
  );
});

test('testConnection: a non-401 HTTP error resolves ok:false, reason http-error with status', async () => {
  await withMockedFetch(
    () => ({ ok: false, status: 500, json: async () => ({}) }),
    async () => {
      const result = await DashboardSync.testConnection(VALID_CONNECTION);
      assert.deepEqual(result, { ok: false, reason: 'http-error', status: 500 });
    },
  );
});

test('testConnection: a network failure (fetch throws) resolves ok:false, reason network-error', async () => {
  await withMockedFetch(
    () => {
      throw new TypeError('Failed to fetch');
    },
    async () => {
      const result = await DashboardSync.testConnection(VALID_CONNECTION);
      assert.deepEqual(result, { ok: false, reason: 'network-error' });
    },
  );
});

test('testConnection: sends a GET request to /api/extension/ping with the Authorization header', async () => {
  await withMockedFetch(
    () => ({ ok: true, status: 200, json: async () => ({ ok: true, email: 'user@example.com' }) }),
    async (calls) => {
      await DashboardSync.testConnection(VALID_CONNECTION);

      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://dashboard.example.com/api/extension/ping');
      assert.equal(calls[0].init.method, 'GET');
      assert.equal(calls[0].init.headers['Authorization'], `Bearer ${VALID_CONNECTION.token}`);
    },
  );
});

test('testConnection: makes no request to the job-sync endpoint', async () => {
  await withMockedFetch(
    () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }),
    async (calls) => {
      await DashboardSync.testConnection(VALID_CONNECTION);
      assert.equal(calls.every((call) => !call.url.includes('/api/jobs/sync')), true);
    },
  );
});

test('testConnection: succeeds even if the response body is not valid JSON', async () => {
  await withMockedFetch(
    () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    }),
    async () => {
      const result = await DashboardSync.testConnection(VALID_CONNECTION);
      assert.deepEqual(result, { ok: true, email: undefined });
    },
  );
});

// ---------------------------------------------------------------------
// buildReconciliationIdentities
// ---------------------------------------------------------------------

test('buildReconciliationIdentities: maps savedJobs entries to exact source+sourceJobId identities', () => {
  const identities = DashboardSync.buildReconciliationIdentities({
    key1: { ...JOB_DATA, source: 'LinkedIn', jobId: '111' },
    key2: { ...JOB_DATA, source: 'Indeed', jobId: '222' },
  });

  assert.deepEqual(identities, [
    { source: 'LinkedIn', sourceJobId: '111' },
    { source: 'Indeed', sourceJobId: '222' },
  ]);
});

test('buildReconciliationIdentities: excludes jobs with no sourceJobId - they have no safe identity to reconcile by', () => {
  const identities = DashboardSync.buildReconciliationIdentities({
    noId: { ...JOB_DATA, source: 'LinkedIn', jobId: null },
    blankId: { ...JOB_DATA, source: 'LinkedIn', jobId: '' },
    missingId: { ...JOB_DATA, source: 'LinkedIn', jobId: undefined },
    hasId: { ...JOB_DATA, source: 'LinkedIn', jobId: '999' },
  });

  assert.deepEqual(identities, [{ source: 'LinkedIn', sourceJobId: '999' }]);
});

test('buildReconciliationIdentities: excludes jobs with no source', () => {
  const identities = DashboardSync.buildReconciliationIdentities({
    noSource: { ...JOB_DATA, source: null, jobId: '111' },
  });
  assert.deepEqual(identities, []);
});

test('buildReconciliationIdentities: an empty/missing savedJobs map returns an empty array, never throws', () => {
  assert.deepEqual(DashboardSync.buildReconciliationIdentities({}), []);
  assert.deepEqual(DashboardSync.buildReconciliationIdentities(null), []);
  assert.deepEqual(DashboardSync.buildReconciliationIdentities(undefined), []);
});

// ---------------------------------------------------------------------
// requestReconciliationPreview
// ---------------------------------------------------------------------

test('requestReconciliationPreview: no connection configured never calls fetch', async () => {
  await withMockedFetch(
    () => {
      throw new Error('fetch should not be called');
    },
    async (calls) => {
      const result = await DashboardSync.requestReconciliationPreview(null, []);
      assert.deepEqual(result, { ok: false, reason: 'not-configured' });
      assert.equal(calls.length, 0);
    },
  );
});

test('requestReconciliationPreview: sends a POST with the identity set as the request body, and the token only in the header', async () => {
  await withMockedFetch(
    () => ({
      ok: true,
      status: 200,
      json: async () => ({ toSyncCount: 0, toKeepCount: 2, toRemoveCount: 0, removalCandidates: [] }),
    }),
    async (calls) => {
      const identities = [{ source: 'LinkedIn', sourceJobId: '111' }];
      await DashboardSync.requestReconciliationPreview(VALID_CONNECTION, identities);

      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://dashboard.example.com/api/jobs/reconcile/preview');
      assert.equal(calls[0].init.method, 'POST');
      assert.equal(calls[0].init.headers['Authorization'], `Bearer ${VALID_CONNECTION.token}`);

      const body = JSON.parse(calls[0].init.body);
      assert.deepEqual(body, { jobs: identities });
      assert.equal(JSON.stringify(body).includes(VALID_CONNECTION.token), false);
    },
  );
});

test('requestReconciliationPreview: zero removal candidates resolves ok:true with an empty removalCandidates array', async () => {
  await withMockedFetch(
    () => ({
      ok: true,
      status: 200,
      json: async () => ({ toSyncCount: 1, toKeepCount: 3, toRemoveCount: 0, removalCandidates: [] }),
    }),
    async () => {
      const result = await DashboardSync.requestReconciliationPreview(VALID_CONNECTION, []);
      assert.deepEqual(result, {
        ok: true,
        preview: { toSyncCount: 1, toKeepCount: 3, toRemoveCount: 0, removalCandidates: [] },
      });
    },
  );
});

test('requestReconciliationPreview: removal candidates are passed through exactly as returned', async () => {
  const candidate = {
    id: 'job-1',
    source: 'LinkedIn',
    sourceJobId: '111',
    title: 'Senior Engineer',
    company: 'Acme Corp',
    updatedAt: '2026-08-16T00:00:00.000Z',
  };

  await withMockedFetch(
    () => ({
      ok: true,
      status: 200,
      json: async () => ({ toSyncCount: 0, toKeepCount: 0, toRemoveCount: 1, removalCandidates: [candidate] }),
    }),
    async () => {
      const result = await DashboardSync.requestReconciliationPreview(VALID_CONNECTION, []);
      assert.equal(result.ok, true);
      assert.deepEqual(result.preview.removalCandidates, [candidate]);
    },
  );
});

test('requestReconciliationPreview: never calls the approve endpoint - it is strictly read-only', async () => {
  await withMockedFetch(
    () => ({
      ok: true,
      status: 200,
      json: async () => ({ toSyncCount: 0, toKeepCount: 0, toRemoveCount: 1, removalCandidates: [{ id: 'job-1' }] }),
    }),
    async (calls) => {
      await DashboardSync.requestReconciliationPreview(VALID_CONNECTION, []);
      assert.equal(calls.every((call) => !call.url.includes('/reconcile/approve')), true);
    },
  );
});

test('requestReconciliationPreview: a 401 response resolves ok:false, reason unauthorized', async () => {
  await withMockedFetch(
    () => ({ ok: false, status: 401 }),
    async () => {
      const result = await DashboardSync.requestReconciliationPreview(VALID_CONNECTION, []);
      assert.deepEqual(result, { ok: false, reason: 'unauthorized', status: 401 });
    },
  );
});

test('requestReconciliationPreview: a non-401 HTTP error resolves ok:false, reason http-error', async () => {
  await withMockedFetch(
    () => ({ ok: false, status: 500 }),
    async () => {
      const result = await DashboardSync.requestReconciliationPreview(VALID_CONNECTION, []);
      assert.deepEqual(result, { ok: false, reason: 'http-error', status: 500 });
    },
  );
});

test('requestReconciliationPreview: a network failure (fetch throws) resolves ok:false, does not throw', async () => {
  await withMockedFetch(
    () => {
      throw new TypeError('Failed to fetch');
    },
    async () => {
      const result = await DashboardSync.requestReconciliationPreview(VALID_CONNECTION, []);
      assert.deepEqual(result, { ok: false, reason: 'network-error' });
    },
  );
});

test('requestReconciliationPreview: a malformed response body resolves ok:false, reason invalid-response', async () => {
  await withMockedFetch(
    () => ({ ok: true, status: 200, json: async () => ({ notWhatWeExpected: true }) }),
    async () => {
      const result = await DashboardSync.requestReconciliationPreview(VALID_CONNECTION, []);
      assert.deepEqual(result, { ok: false, reason: 'invalid-response' });
    },
  );
});

// ---------------------------------------------------------------------
// approveReconciliationRemovals
// ---------------------------------------------------------------------

test('approveReconciliationRemovals: no connection configured never calls fetch', async () => {
  await withMockedFetch(
    () => {
      throw new Error('fetch should not be called');
    },
    async (calls) => {
      const result = await DashboardSync.approveReconciliationRemovals(null, [
        { id: 'job-1', updatedAt: '2026-08-16T00:00:00.000Z' },
      ]);
      assert.deepEqual(result, { ok: false, reason: 'not-configured' });
      assert.equal(calls.length, 0);
    },
  );
});

test('approveReconciliationRemovals: sends only {id, updatedAt} for each candidate - never the full candidate object, and never the token in the body', async () => {
  await withMockedFetch(
    () => ({
      ok: true,
      status: 200,
      json: async () => ({ deletedCount: 1, deletedIds: ['job-1'], skippedIds: [] }),
    }),
    async (calls) => {
      const candidates = [
        {
          id: 'job-1',
          source: 'LinkedIn',
          sourceJobId: '111',
          title: 'Senior Engineer',
          company: 'Acme Corp',
          updatedAt: '2026-08-16T00:00:00.000Z',
        },
      ];

      await DashboardSync.approveReconciliationRemovals(VALID_CONNECTION, candidates);

      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://dashboard.example.com/api/jobs/reconcile/approve');
      assert.equal(calls[0].init.method, 'POST');
      assert.equal(calls[0].init.headers['Authorization'], `Bearer ${VALID_CONNECTION.token}`);

      const body = JSON.parse(calls[0].init.body);
      assert.deepEqual(body, {
        approvals: [{ id: 'job-1', updatedAt: '2026-08-16T00:00:00.000Z' }],
      });
      assert.equal(JSON.stringify(body).includes(VALID_CONNECTION.token), false);
    },
  );
});

test('approveReconciliationRemovals: an empty candidate list never calls fetch, resolves ok:false reason no-candidates', async () => {
  await withMockedFetch(
    () => {
      throw new Error('fetch should not be called');
    },
    async (calls) => {
      const result = await DashboardSync.approveReconciliationRemovals(VALID_CONNECTION, []);
      assert.deepEqual(result, { ok: false, reason: 'no-candidates' });
      assert.equal(calls.length, 0);
    },
  );
});

test('approveReconciliationRemovals: surfaces deletedIds and skippedIds distinctly - a skipped (stale) candidate is never reported as deleted', async () => {
  await withMockedFetch(
    () => ({
      ok: true,
      status: 200,
      json: async () => ({ deletedCount: 1, deletedIds: ['job-1'], skippedIds: ['job-2'] }),
    }),
    async () => {
      const result = await DashboardSync.approveReconciliationRemovals(VALID_CONNECTION, [
        { id: 'job-1', updatedAt: '2026-08-16T00:00:00.000Z' },
        { id: 'job-2', updatedAt: '2026-08-15T00:00:00.000Z' },
      ]);

      assert.deepEqual(result, {
        ok: true,
        deletedCount: 1,
        deletedIds: ['job-1'],
        skippedIds: ['job-2'],
      });
      assert.equal(result.deletedIds.includes('job-2'), false);
    },
  );
});

test('approveReconciliationRemovals: a 401 response resolves ok:false, reason unauthorized', async () => {
  await withMockedFetch(
    () => ({ ok: false, status: 401 }),
    async () => {
      const result = await DashboardSync.approveReconciliationRemovals(VALID_CONNECTION, [
        { id: 'job-1', updatedAt: '2026-08-16T00:00:00.000Z' },
      ]);
      assert.deepEqual(result, { ok: false, reason: 'unauthorized', status: 401 });
    },
  );
});

test('approveReconciliationRemovals: a network failure (fetch throws) resolves ok:false, does not throw', async () => {
  await withMockedFetch(
    () => {
      throw new TypeError('Failed to fetch');
    },
    async () => {
      const result = await DashboardSync.approveReconciliationRemovals(VALID_CONNECTION, [
        { id: 'job-1', updatedAt: '2026-08-16T00:00:00.000Z' },
      ]);
      assert.deepEqual(result, { ok: false, reason: 'network-error' });
    },
  );
});

// ---------------------------------------------------------------------
// Suppressed-job sync responses (POST /api/jobs/sync returning
// { job: null, suppressed: true } for a manually-deleted, tombstoned
// dashboard job) - syncJob() only ever inspects response.ok, so a
// suppressed 200 response must resolve exactly like any other
// successful sync: ok:true, no warning, nothing recreated.
// ---------------------------------------------------------------------

test('syncJob: a suppressed-job response (200, {job:null,suppressed:true}) resolves ok:true like any other successful sync', async () => {
  await withMockedFetch(
    () => ({
      ok: true,
      status: 200,
      json: async () => ({ job: null, suppressed: true }),
    }),
    async () => {
      const result = await DashboardSync.syncJob(VALID_CONNECTION, JOB_DATA);
      assert.deepEqual(result, { ok: true });
    },
  );
});
