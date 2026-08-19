// Regression coverage for the toolbar-icon/Filter-Settings/Saved-Jobs
// navigation fix. background.js, content-universal.js, and options.js
// call chrome.* APIs directly at module scope (no dependency-injection
// seam, unlike keyword-matching.js/dashboard-sync.js), and background.js
// uses importScripts(), which doesn't exist in Node - so none of them
// can be safely require()'d into a Node test the way this repo's other
// pure-logic modules are. This file instead pins:
//   (a) the manifest shape the fix depends on, via real JSON parsing
//       (no mocking needed - a genuine regression guard), and
//   (b) that the specific wiring the fix introduced is still present in
//       source, as a guard against it being silently reverted/dropped.
// Live browser behavior (does the toolbar icon actually open Settings,
// does Filter Settings actually navigate) is verified manually/live -
// see the task's own manual verification steps, not this file.
//
// Plain Node, built-in test runner only. Run with: node --test test/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifest = require('../manifest.json');
const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const contentSource = fs.readFileSync(path.join(__dirname, '..', 'content-universal.js'), 'utf8');
const optionsJsSource = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8');
const optionsHtmlSource = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf8');

// ---------------------------------------------------------------------
// manifest.json
// ---------------------------------------------------------------------

test('manifest: action has no default_popup, so chrome.action.onClicked fires (toolbar icon opens Settings, not Saved Jobs)', () => {
  assert.equal(manifest.action.default_popup, undefined);
});

test('manifest: options_page still points at options.html', () => {
  assert.equal(manifest.options_page, 'options.html');
});

test('manifest: extension identity is unchanged (name, manifest_version) - version is expected to increment across releases, so it is only checked for shape below, not an exact value', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'LinkedIn Job Search Filter');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test('manifest: background service worker declaration is unchanged', () => {
  assert.equal(manifest.background.service_worker, 'background.js');
});

// ---------------------------------------------------------------------
// background.js - toolbar icon and Settings navigation wiring
// ---------------------------------------------------------------------

test('background.js: registers a chrome.action.onClicked listener (toolbar icon -> Settings)', () => {
  assert.match(backgroundSource, /chrome\.action\.onClicked\.addListener/);
});

test('background.js: the onClicked listener body opens Settings, not the Saved Jobs popup', () => {
  const match = backgroundSource.match(/chrome\.action\.onClicked\.addListener\(\(\)\s*=>\s*\{([\s\S]*?)\}\);/);
  assert.ok(match, 'expected an onClicked listener with a simple arrow-function body');
  assert.match(match[1], /openSettings\(\)/);
});

test('background.js: openOptions message handler and toolbar icon both funnel through the same openSettings() function (one reliable path)', () => {
  const openSettingsDefinitions = backgroundSource.match(/function openSettings\(/g) || [];
  assert.equal(openSettingsDefinitions.length, 1, 'openSettings should be defined exactly once');

  // Excludes the `function openSettings() {` definition line itself -
  // only counts actual call sites.
  const openSettingsCalls = backgroundSource.match(/(?<!function )openSettings\(\);/g) || [];
  // Once for chrome.action.onClicked, once for the 'openOptions' message
  // handler - if this count grows without a corresponding new caller,
  // or a caller starts calling openOptionsPage() directly instead, this
  // test should be revisited.
  assert.equal(openSettingsCalls.length, 2);
});

test('background.js: openPopup message handler still opens popup.html (Saved Jobs) in a new tab', () => {
  assert.match(backgroundSource, /request\.action === 'openPopup'/);
  assert.match(backgroundSource, /chrome\.tabs\.create\(\{\s*\n?\s*url: chrome\.runtime\.getURL\('popup\.html'\)/);
});

// ---------------------------------------------------------------------
// content-universal.js - in-page Filter Settings / View Saved Jobs
// ---------------------------------------------------------------------

test("content-universal.js: the Filter Settings button still sends the 'openOptions' message", () => {
  const match = contentSource.match(/settingsBtn\.addEventListener\('click', \(\) => \{([\s\S]*?)\}\);/);
  assert.ok(match, 'expected a click listener on settingsBtn');
  assert.match(match[1], /action: 'openOptions'/);
});

test("content-universal.js: the View Saved Jobs button still sends the 'openPopup' message", () => {
  const match = contentSource.match(/viewSavedBtn\.addEventListener\('click', \(\) => \{([\s\S]*?)\}\);/);
  assert.ok(match, 'expected a click listener on viewSavedBtn');
  assert.match(match[1], /action: 'openPopup'/);
});

// ---------------------------------------------------------------------
// options.js / options.html - Saved Jobs reachable from Settings
// ---------------------------------------------------------------------

test('options.html: has a View Saved Jobs control', () => {
  assert.match(optionsHtmlSource, /id="viewSavedJobsBtn"/);
});

test('options.js: wires the View Saved Jobs button to open popup.html in a new tab', () => {
  assert.match(optionsJsSource, /viewSavedJobsBtn['"]?\)\.addEventListener\('click', openSavedJobs\)/);
  assert.match(optionsJsSource, /chrome\.tabs\.create\(\{\s*url: chrome\.runtime\.getURL\('popup\.html'\)/);
});

test('options.js: opening Saved Jobs never touches chrome.storage (pure navigation, no state mutation)', () => {
  const match = optionsJsSource.match(/function openSavedJobs\(\) \{([\s\S]*?)\n\}/);
  assert.ok(match, 'expected an openSavedJobs function');
  assert.doesNotMatch(match[1], /chrome\.storage/);
});
