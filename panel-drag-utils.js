// Shared, dependency-free helper behind the draggable floating panel in
// content-universal.js. Loaded as a plain classic script in the content
// script context (via manifest.json's content_scripts) and requireable
// from Node for the regression tests in test/panel-drag-utils.test.js.
//
// This is the one piece of the drag feature worth extracting and unit
// testing on its own: the pure math that keeps the panel from being
// dragged completely off-screen. Pointer-event wiring stays in
// content-universal.js since it's DOM-bound and has no logic worth
// testing separately from a real browser.

const PanelDragUtils = {
  // Clamps a candidate panel position so the whole panel stays within
  // the viewport - never partially or fully off-screen - regardless of
  // where a drag would otherwise place it. Falls back to 0 on either
  // axis if the panel is larger than the viewport itself.
  clampPosition({ left, top, width, height, viewportWidth, viewportHeight }) {
    const maxLeft = Math.max(0, viewportWidth - width);
    const maxTop = Math.max(0, viewportHeight - height);

    return {
      left: Math.min(Math.max(left, 0), maxLeft),
      top: Math.min(Math.max(top, 0), maxTop),
    };
  },
};

// Content-script context: classic script, shared `window`.
if (typeof window !== 'undefined') {
  window.PanelDragUtils = PanelDragUtils;
}

// Node context: used by test/panel-drag-utils.test.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PanelDragUtils;
}
