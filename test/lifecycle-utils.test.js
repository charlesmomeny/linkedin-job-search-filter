// Regression tests for lifecycle-utils.js — the pure decision helpers
// behind the fix for accumulating LinkedIn MutationObservers/timers
// and the filter observer self-triggering on its own DOM writes.
//
// Plain Node, built-in test runner only (no package manager, no
// third-party framework). Run with: node --test test/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const LifecycleUtils = require('../lifecycle-utils.js');

// ---------------------------------------------------------------------
// decideResourceAction: idempotent resource registration
// ---------------------------------------------------------------------

test('decideResourceAction: no previous key means create', () => {
  assert.equal(LifecycleUtils.decideResourceAction(null, 'main-node'), 'create');
  assert.equal(LifecycleUtils.decideResourceAction(undefined, 'main-node'), 'create');
});

test('decideResourceAction: same key as before means reuse', () => {
  const key = { id: 'stable-target' };
  assert.equal(LifecycleUtils.decideResourceAction(key, key), 'reuse');
  assert.equal(LifecycleUtils.decideResourceAction('main', 'main'), 'reuse');
});

test('decideResourceAction: a different key means replace', () => {
  const oldKey = { id: 'old-main' };
  const newKey = { id: 'new-main' };
  assert.equal(LifecycleUtils.decideResourceAction(oldKey, newKey), 'replace');
});

test('decideResourceAction: repeated calls with the same key never drift from reuse', () => {
  const key = 'main-node';
  for (let i = 0; i < 5; i++) {
    assert.equal(LifecycleUtils.decideResourceAction(key, key), 'reuse');
  }
});

// ---------------------------------------------------------------------
// isExternalChange: mutation-batch classification
// ---------------------------------------------------------------------

test('isExternalChange: a batch that is entirely the extension\'s own writes is not external', () => {
  assert.equal(LifecycleUtils.isExternalChange([true, true, true]), false);
});

test('isExternalChange: a single non-extension-owned node makes the batch external', () => {
  assert.equal(LifecycleUtils.isExternalChange([true, true, false]), true);
});

test('isExternalChange: a batch that is entirely external changes is external', () => {
  assert.equal(LifecycleUtils.isExternalChange([false, false]), true);
});

test('isExternalChange: a single extension-owned node is not external', () => {
  assert.equal(LifecycleUtils.isExternalChange([true]), false);
});

test('isExternalChange: a single external node is external', () => {
  assert.equal(LifecycleUtils.isExternalChange([false]), true);
});

test('isExternalChange: an empty batch is not external (nothing to react to)', () => {
  assert.equal(LifecycleUtils.isExternalChange([]), false);
});
