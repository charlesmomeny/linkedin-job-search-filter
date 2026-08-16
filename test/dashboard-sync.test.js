// Regression tests for dashboard-sync.js - the module that talks to the
// optional Job Saver web dashboard. Covers payload mapping, the
// no-connection-configured short circuit (must never call fetch),
// successful/failed sync, the Authorization header, and malformed
// Dashboard URL handling.
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
    sourceSavedAt: '2026-08-16T00:00:00.000Z',
  });
});

test('buildSyncPayload: maps a missing jobId to null sourceJobId, not a fabricated id', () => {
  const payload = DashboardSync.buildSyncPayload({ ...JOB_DATA, jobId: null });
  assert.equal(payload.sourceJobId, null);
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
