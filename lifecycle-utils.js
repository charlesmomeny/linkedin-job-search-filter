// Shared, dependency-free lifecycle helpers for content-universal.js's
// recurring resources (MutationObservers, polling timers). Loaded as a
// plain classic script in the content-script context only (via
// manifest.json's content_scripts) - this logic has no popup use - and
// requireable from Node for the regression tests in
// test/lifecycle-utils.test.js.
//
// These are the pure decision points extracted out of DOM-bound setup
// code, so repeated initialization (LinkedIn's SPA navigation re-runs
// init() without a full page reload) can be verified not to accumulate
// duplicate observers/timers, and so the filter observer can be
// verified not to react to the extension's own DOM writes.

const LifecycleUtils = {
  // Decides what a resource-installer function (e.g. an observer setup
  // function keyed by the DOM node it watches) should do given the key
  // it registered last time and the key it would use now:
  //   - no previous key -> 'create' a new resource.
  //   - same key as before -> 'reuse' the existing resource untouched.
  //   - a different key -> 'replace': disconnect/clear the old
  //     resource before creating a new one (e.g. the watched DOM node
  //     was swapped out by the SPA).
  // This is what keeps repeated init() calls from stacking duplicate
  // MutationObservers/timers on top of each other.
  decideResourceAction(previousKey, newKey) {
    if (previousKey === null || previousKey === undefined) {
      return 'create';
    }
    if (previousKey === newKey) {
      return 'reuse';
    }
    return 'replace';
  },

  // Given a batch of booleans - one per changed node in a
  // MutationObserver callback's mutation list, true meaning "this node
  // belongs to the extension's own UI" - decides whether the batch
  // contains at least one genuinely external (e.g. LinkedIn-authored)
  // change worth reacting to. A batch made up entirely of the
  // extension's own writes (filter badges, panel updates) must not be
  // treated as a reason to redo work.
  isExternalChange(nodeOwnershipFlags) {
    return nodeOwnershipFlags.some(isExtensionOwned => !isExtensionOwned);
  }
};

// Content-script context: classic script, shared `window`.
if (typeof window !== 'undefined') {
  window.LifecycleUtils = LifecycleUtils;
}

// Node context: used by test/lifecycle-utils.test.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LifecycleUtils;
}
