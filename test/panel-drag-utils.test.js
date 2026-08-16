// Regression tests for panel-drag-utils.js — the pure clamping math
// behind the draggable floating panel, which must never let the panel
// be dragged off-screen.
//
// Plain Node, built-in test runner only (no package manager, no
// third-party framework). Run with: node --test test/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const PanelDragUtils = require('../panel-drag-utils.js');

const VIEWPORT = { viewportWidth: 1200, viewportHeight: 800 };
const PANEL = { width: 220, height: 300 };

test('clampPosition: leaves an in-bounds position untouched', () => {
  const result = PanelDragUtils.clampPosition({ left: 500, top: 200, ...PANEL, ...VIEWPORT });
  assert.deepEqual(result, { left: 500, top: 200 });
});

test('clampPosition: pulls the panel back onto screen when dragged past the left/top edge', () => {
  const result = PanelDragUtils.clampPosition({ left: -400, top: -300, ...PANEL, ...VIEWPORT });
  assert.deepEqual(result, { left: 0, top: 0 });
});

test('clampPosition: pulls the panel back onto screen when dragged past the right edge', () => {
  const result = PanelDragUtils.clampPosition({ left: 5000, top: 200, ...PANEL, ...VIEWPORT });
  assert.equal(result.left, VIEWPORT.viewportWidth - PANEL.width);
});

test('clampPosition: pulls the panel back onto screen when dragged past the bottom edge', () => {
  const result = PanelDragUtils.clampPosition({ left: 500, top: 5000, ...PANEL, ...VIEWPORT });
  assert.equal(result.top, VIEWPORT.viewportHeight - PANEL.height);
});

test('clampPosition: exact edge positions are left alone (not off-screen)', () => {
  const maxLeft = VIEWPORT.viewportWidth - PANEL.width;
  const maxTop = VIEWPORT.viewportHeight - PANEL.height;
  const result = PanelDragUtils.clampPosition({ left: maxLeft, top: maxTop, ...PANEL, ...VIEWPORT });
  assert.deepEqual(result, { left: maxLeft, top: maxTop });
});

test('clampPosition: falls back to 0 on an axis where the panel is bigger than the viewport', () => {
  const result = PanelDragUtils.clampPosition({
    left: -50,
    top: -50,
    width: 2000,
    height: 2000,
    ...VIEWPORT,
  });
  assert.deepEqual(result, { left: 0, top: 0 });
});
