// Shared, dependency-free helper for building a search-safe text blob
// from a job card's rendered content. Loaded as a plain classic script
// in the content-script context (via manifest.json) and requireable
// from Node for the regression tests in
// test/card-text-extraction.test.js.
//
// Root cause this fixes: site-adapters.js's extractJobDataFromCard()
// previously built its "fullText" (what excludeAnywhere/excludeLocations
// match against - see content-universal.js's evaluateJobCard()) directly
// from `card.textContent`. element.textContent concatenates every
// descendant leaf's text with NO separator unless an actual whitespace
// *text node* sits between them in the DOM - CSS (flex/grid gap,
// margin) supplies the visual gap between sibling elements, not a
// character in the text itself. So two adjacent leaf elements - e.g. a
// job title and, right after it with no whitespace text node between,
// a company name - can read as "...managerOracle..." in
// card.textContent even though they render as two clearly separate
// lines.
//
// keyword-matching.js's containsKeyword() requires a `\b` word
// boundary on the side(s) of an ordinary keyword like "Oracle" to
// avoid false positives (excluding "art" must not also match "start"
// or "party" - see that file's own comment). A `\b` needs a non-word
// character on that side, and two glued-together words provide none,
// so a real, visible "Oracle" company name silently failed to match an
// "Exclude from Anywhere" keyword whenever LinkedIn's markup happened
// to glue it to the preceding text. This is the exact same class of
// bug already found and fixed once in this codebase for the
// "Reposted" badge (see job-freshness.js's isReposted comment) - that
// fix could use a plain substring check because "reposted" is a fixed,
// extension-controlled literal; excludeAnywhere/excludeLocations match
// arbitrary user-entered keywords, so loosening containsKeyword itself
// to plain substring isn't safe here (it would reintroduce exactly the
// false-positive bug containsKeyword was built to prevent). Fixing the
// TEXT instead - guaranteeing an explicit boundary between every
// leaf element's text regardless of whether the source markup included
// real whitespace there - fixes the miss without loosening the match.
const CardTextExtraction = {
  // Walks `element`'s descendant tree and joins every leaf element's
  // (an element with no child elements) own trimmed text with an
  // explicit '\n', so two adjacent pieces of visible text are always
  // boundary-separated in the result even when the DOM itself glues
  // them together with no whitespace character. Never throws on a
  // non-element input - returns '' instead, so a single unexpected
  // node shape can't abort filtering for the whole card.
  extractSearchableText(element) {
    if (!element || typeof element !== 'object') return '';

    const children = element.children;
    if (!children || children.length === 0) {
      return typeof element.textContent === 'string' ? element.textContent.trim() : '';
    }

    return Array.from(children)
      .map((child) => this.extractSearchableText(child))
      .filter((text) => text.length > 0)
      .join('\n');
  }
};

// Content-script context: classic script, shared `window`.
if (typeof window !== 'undefined') {
  window.CardTextExtraction = CardTextExtraction;
}

// Node context: used by test/card-text-extraction.test.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CardTextExtraction;
}
