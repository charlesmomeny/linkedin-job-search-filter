// Regression tests for card-text-extraction.js and its effect on the
// "Exclude from Anywhere (Title, Description, Company)" filter.
//
// Real bug reproduced here: a LinkedIn job card whose title and
// company name render as two adjacent leaf elements with no actual
// whitespace character between them in card.textContent (only a
// CSS-only visual gap). A company name excluded via "Exclude from
// Anywhere" - e.g. "Oracle" - must still be matched even when the
// card's raw text reads like "...program manageroracle..." with the
// two words glued together.
//
// Plain Node, built-in test runner only (no package manager, no
// third-party framework). Run with: node --test test/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const CardTextExtraction = require('../card-text-extraction.js');
const KeywordMatching = require('../keyword-matching.js');

// ---------------------------------------------------------------------
// extractSearchableText
// ---------------------------------------------------------------------

// Minimal fake DOM element: only the two properties
// extractSearchableText actually reads (children, textContent) -
// mirrors the real element.children (element-only) / element.textContent
// (own + descendant text) contract closely enough for this pure logic.
function fakeEl(children, textContent) {
  return { children: children || [], textContent: textContent || '' };
}

test('extractSearchableText: joins sibling leaf elements with an explicit boundary even when glued with no whitespace', () => {
  // Reproduces the real bug: title and company rendered as two leaf
  // elements whose own textContent has NO trailing/leading whitespace -
  // exactly what "CSS supplies the visual gap, not a text-node space"
  // looks like structurally.
  const card = fakeEl([
    fakeEl([], 'Principal Program Manager'),
    fakeEl([], 'Oracle'),
    fakeEl([], 'United States (Remote)'),
  ]);

  const text = CardTextExtraction.extractSearchableText(card);
  assert.equal(text, 'Principal Program Manager\nOracle\nUnited States (Remote)');

  // The word-boundary regex containsKeyword() relies on must now find
  // a real boundary around "Oracle" - this is the actual assertion
  // that matters for the filter.
  assert.equal(KeywordMatching.containsKeyword(text, 'Oracle'), true);
});

test('extractSearchableText: still works when real whitespace/newlines already separate elements', () => {
  const card = fakeEl([
    fakeEl([], 'Senior Engineer'),
    fakeEl([], 'Acme Corp'),
  ]);
  assert.equal(CardTextExtraction.extractSearchableText(card), 'Senior Engineer\nAcme Corp');
});

test('extractSearchableText: recurses through nested wrapper elements', () => {
  const card = fakeEl([
    fakeEl([fakeEl([], 'Program Manager')], ''),
    fakeEl([fakeEl([], 'Oracle'), fakeEl([], 'Remote')], ''),
  ]);
  assert.equal(CardTextExtraction.extractSearchableText(card), 'Program Manager\nOracle\nRemote');
});

test('extractSearchableText: empty/whitespace-only leaves are dropped, never produce a stray blank line', () => {
  const card = fakeEl([
    fakeEl([], 'Program Manager'),
    fakeEl([], '   '),
    fakeEl([], 'Oracle'),
  ]);
  assert.equal(CardTextExtraction.extractSearchableText(card), 'Program Manager\nOracle');
});

test('extractSearchableText: never throws on a non-element/null input', () => {
  assert.doesNotThrow(() => CardTextExtraction.extractSearchableText(null));
  assert.doesNotThrow(() => CardTextExtraction.extractSearchableText(undefined));
  assert.equal(CardTextExtraction.extractSearchableText(null), '');
});

// ---------------------------------------------------------------------
// End-to-end regression: the 4 required scenarios, replicating
// evaluateJobCard's exclude-title / exclude-anywhere decision exactly
// as content-universal.js implements it (title checked against
// excludeTitles only; fullText checked against excludeAnywhere).
// ---------------------------------------------------------------------

function evaluateExcludeDecision({ title, fullText, excludeTitles, excludeAnywhere }) {
  for (const keyword of excludeTitles) {
    if (KeywordMatching.containsKeyword(title, keyword)) {
      return { shouldFilter: true, reason: `Contains "${keyword}" in title` };
    }
  }
  for (const keyword of excludeAnywhere) {
    if (KeywordMatching.containsKeyword(fullText, keyword)) {
      return { shouldFilter: true, reason: `Contains "${keyword}"` };
    }
  }
  return { shouldFilter: false, reason: '' };
}

// Builds fullText the same way extractJobDataFromCard now does:
// CardTextExtraction over a glued (no real whitespace) title/company/
// location leaf structure - the real-world shape this bug reproduces.
function gluedCardFullText(title, company, location) {
  const card = fakeEl([
    fakeEl([], title),
    fakeEl([], company),
    fakeEl([], location),
  ]);
  return CardTextExtraction.extractSearchableText(card).toLowerCase();
}

test('regression: company "Oracle" + exclude-anywhere "Oracle" => hidden', () => {
  const fullText = gluedCardFullText('Principal Program Manager', 'Oracle', 'United States (Remote)');
  const decision = evaluateExcludeDecision({
    title: 'principal program manager',
    fullText,
    excludeTitles: [],
    excludeAnywhere: ['Oracle'],
  });
  assert.equal(decision.shouldFilter, true);
  assert.equal(decision.reason, 'Contains "Oracle"');
});

test('regression: company "Oracle" + title-only exclude "Oracle" => NOT hidden when title lacks Oracle', () => {
  const decision = evaluateExcludeDecision({
    title: 'principal program manager',
    fullText: gluedCardFullText('Principal Program Manager', 'Oracle', 'United States (Remote)'),
    excludeTitles: ['Oracle'],
    excludeAnywhere: [],
  });
  assert.equal(decision.shouldFilter, false);
});

test('regression: title containing "Oracle" + title-only exclude "Oracle" => hidden', () => {
  const decision = evaluateExcludeDecision({
    title: 'oracle cloud program manager',
    fullText: gluedCardFullText('Oracle Cloud Program Manager', 'Acme Staffing', 'Remote'),
    excludeTitles: ['Oracle'],
    excludeAnywhere: [],
  });
  assert.equal(decision.shouldFilter, true);
  assert.equal(decision.reason, 'Contains "Oracle" in title');
});

test('regression: unrelated company/title is unaffected by an "Oracle" exclude-anywhere filter', () => {
  const decision = evaluateExcludeDecision({
    title: 'staff software engineer',
    fullText: gluedCardFullText('Staff Software Engineer', 'Acme Corp', 'Remote'),
    excludeTitles: [],
    excludeAnywhere: ['Oracle'],
  });
  assert.equal(decision.shouldFilter, false);
});

test('regression: exclude-anywhere "Oracle" does not false-positive on unrelated words (e.g. "Oracles")', () => {
  // Documents that fixing the boundary-loss bug does not loosen
  // matching into a plain substring check - still whole-word only.
  const fullText = gluedCardFullText('Data Oracles Analyst', 'Acme Corp', 'Remote');
  assert.equal(KeywordMatching.containsKeyword(fullText, 'Oracle'), false);
});
