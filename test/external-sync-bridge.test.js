// Regression coverage for the web-triggered sync bridge
// (job-saver-web's "Sync from Extension" button -> this extension's
// chrome.runtime.onMessageExternal listener). background.js calls
// chrome.* APIs directly at module scope and uses importScripts(),
// which doesn't exist in Node, so it can't be require()'d into a Node
// test the way this repo's pure-logic modules are - see
// test/manifest-and-navigation.test.js's own header comment for the
// same constraint and approach. This file pins:
//   (a) the manifest's externally_connectable origin allowlist, via
//       real JSON parsing, and
//   (b) that the specific security-relevant wiring (origin check,
//       action allowlist, shared-function reuse, no token/storage
//       access in the external listener itself) is still present in
//       source, as a guard against it being silently weakened.
// Live cross-origin messaging behavior is verified manually - see the
// task's own manual verification steps, not this file.
//
// Plain Node, built-in test runner only. Run with: node --test test/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifest = require('../manifest.json');
const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

// ---------------------------------------------------------------------
// manifest.json
// ---------------------------------------------------------------------

test('manifest: externally_connectable allows exactly the Job Saver web origins - Production and local DEVELOPMENT, nothing broader', () => {
  assert.ok(manifest.externally_connectable, 'expected an externally_connectable key');
  assert.deepEqual(
    manifest.externally_connectable.matches.slice().sort(),
    ['http://localhost:3000/*', 'https://job-saver-web.vercel.app/*'].sort(),
  );
});

test('manifest: externally_connectable does not include a wildcard match pattern', () => {
  for (const pattern of manifest.externally_connectable.matches) {
    assert.doesNotMatch(pattern, /^\*:\/\/\*\/|^<all_urls>$|^https?:\/\/\*\//);
  }
});

// ---------------------------------------------------------------------
// background.js - external listener wiring
// ---------------------------------------------------------------------

function externalListenerBody() {
  const match = backgroundSource.match(
    /chrome\.runtime\.onMessageExternal\.addListener\(\(request, sender, sendResponse\) => \{([\s\S]*?)\n\}\);/,
  );
  assert.ok(match, 'expected a chrome.runtime.onMessageExternal listener');
  return match[1];
}

test('background.js: registers an onMessageExternal listener', () => {
  assert.match(backgroundSource, /chrome\.runtime\.onMessageExternal\.addListener/);
});

test('background.js: the external listener rejects any sender origin not in an explicit allowlist (defense in depth beyond the manifest)', () => {
  const body = externalListenerBody();
  assert.match(body, /ALLOWED_EXTERNAL_ORIGINS\.has\(sender\.origin\)/);
  assert.match(body, /reason: 'forbidden'/);
});

test("background.js: the explicit origin allowlist matches the manifest's externally_connectable origins exactly", () => {
  const match = backgroundSource.match(/const ALLOWED_EXTERNAL_ORIGINS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(match, 'expected an ALLOWED_EXTERNAL_ORIGINS Set literal');
  const origins = match[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
  const manifestOrigins = manifest.externally_connectable.matches.map((m) => m.replace(/\/\*$/, ''));
  assert.deepEqual(origins.slice().sort(), manifestOrigins.slice().sort());
});

test('background.js: only syncDashboard and approveReconciliationRemovals are externally reachable - the allowlist is not the full internal action set', () => {
  const match = backgroundSource.match(/const ALLOWED_EXTERNAL_ACTIONS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(match, 'expected an ALLOWED_EXTERNAL_ACTIONS Set literal');
  const actions = match[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
  assert.deepEqual(actions.slice().sort(), ['approveReconciliationRemovals', 'syncDashboard'].sort());
});

test('background.js: the external listener never reads chrome.storage directly - it only delegates to the shared perform*() functions that already own storage access', () => {
  const body = externalListenerBody();
  assert.doesNotMatch(body, /chrome\.storage/);
});

test('background.js: the external listener never references a token, connection, or credential value directly', () => {
  const body = externalListenerBody();
  assert.doesNotMatch(body, /\.token\b/);
  assert.doesNotMatch(body, /dashboardConnection/);
});

test('background.js: syncDashboard is handled by the same performDashboardSync() function both internally and externally (no duplicated sync logic)', () => {
  const definitions = (backgroundSource.match(/async function performDashboardSync\(/g) || []).length;
  assert.equal(definitions, 1);

  const calls = (backgroundSource.match(/performDashboardSync\(\)\.then\(/g) || []).length;
  // Once from the internal onMessage listener, once from onMessageExternal.
  assert.equal(calls, 2);
});

test('background.js: approveReconciliationRemovals is handled by the same performApproveReconciliationRemovals() function both internally and externally (no duplicated logic)', () => {
  const definitions = (backgroundSource.match(/async function performApproveReconciliationRemovals\(/g) || []).length;
  assert.equal(definitions, 1);

  const calls = (
    backgroundSource.match(/performApproveReconciliationRemovals\([^)]*\)\.then\(/g) || []
  ).length;
  // Once from the internal onMessage listener, once from onMessageExternal.
  assert.equal(calls, 2);
});

test('background.js: an unrecognized external action is rejected, not silently ignored or dispatched', () => {
  const body = externalListenerBody();
  assert.match(body, /ALLOWED_EXTERNAL_ACTIONS\.has\(request\.action\)/);
});
