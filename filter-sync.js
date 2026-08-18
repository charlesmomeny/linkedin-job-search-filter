// Builds the versioned filter-settings payload sent to the optional Job
// Saver web dashboard's Discover import ("Sync Filters to Dashboard" in
// Settings), and reports which of the extension's current filter
// settings could/couldn't be represented.
//
// Loaded via importScripts() in the background service worker (used by
// dashboard-sync.js) and via a <script> tag in options.html, and
// requireable from Node for test/filter-sync.test.js.
//
// This does NOT talk to the network itself - see dashboard-sync.js's
// syncFilterSettings(), which sends the payload this module builds.
// This module never reads/writes chrome.storage and never mutates the
// filterSettings object passed in - it's a pure mapping layer, so the
// extension's own local filter settings/behavior are provably
// unaffected by a sync.
//
// ---------------------------------------------------------------------
// Mapping audit (see job-saver-web's lib/services/discoverQuery.ts for
// the Discover schema this was audited against)
// ---------------------------------------------------------------------
// Of the extension's 10 filterSettings fields, only 4 describe an
// actual filter CRITERION that Discover has a genuine equivalent for:
//
//   maxJobAge         -> EXACT.       Same concept either side: a
//                        numeric max-posting-age-in-days threshold.
//                        Extension reads it off LinkedIn's "posted X
//                        ago" text; Discover reads it off Greenhouse's
//                        official first_published API field - different
//                        sources, identical semantics.
//   excludeTitles      -> SAFE_ADAPTATION. Same purpose (hide jobs whose
//                        title contains a keyword), same requirement
//                        semantics (title checked in isolation, never
//                        company/description). Matching MECHANICS
//                        differ: the extension requires a whole-word
//                        match (\bkeyword\b - see keyword-matching.js);
//                        Discover's titleExclude is a plain
//                        case-insensitive substring match (existing,
//                        untouched Discover behavior - not something
//                        this package may change). A keyword that is a
//                        substring of another word (e.g. "art" inside
//                        "start") can therefore match slightly more
//                        broadly on Discover than it did in the
//                        extension.
//   includeTitles      -> SAFE_ADAPTATION. Same "must contain at least
//                        one of these keywords in the title, else hide"
//                        OR-semantics as Discover's titleInclude. Same
//                        substring-vs-whole-word matching caveat as
//                        excludeTitles above.
//   excludeLocations   -> SAFE_ADAPTATION. Same *purpose* (hide jobs at
//                        an unwanted location), but the extension
//                        actually matches these keywords against the
//                        ENTIRE visible card text (title/company/
//                        location/salary/etc - see content-universal.js's
//                        evaluateJobCard(), which checks excludeLocations
//                        against `fullText`, not a location-only
//                        field), while Discover's locationExclude
//                        matches ONLY the job's own location field.
//                        Mapping the keyword list across is safe - it
//                        can only narrow matches (no field left for a
//                        location keyword to accidentally match a
//                        company/title on Discover), never broaden them
//                        into a new false exclusion.
//
// Six fields are UNSUPPORTED - never sent, and reported to the user as
// LinkedIn-only rather than silently dropped:
//
//   excludeAnywhere    -> UNSUPPORTED. Its whole point (per its own
//                        Settings label, "Exclude from Anywhere (Title,
//                        Description, Company)") is matching across
//                        title + description + company together.
//                        Discover has no equivalent combined/free-text
//                        search - IndexedJob has no description field
//                        it searches at all (see directJobs.ts's
//                        buildIndexedJobWhere - only title, location,
//                        and sourceCompany.companyName are ever
//                        matched, each as its own separate field, never
//                        combined). There is no way to safely decide
//                        which of a user's excludeAnywhere keywords
//                        were "really" meant as company names - forcing
//                        that guess is exactly the "map wholesale to a
//                        different semantic meaning" this integration
//                        must not do, so this is left unsupported
//                        rather than silently narrowed to
//                        companyExclude.
//   includeLocations   -> UNSUPPORTED. Despite the name, this setting
//                        does not filter/hide anything - see
//                        evaluateJobCard(): a includeLocations match
//                        only sets isHighlighted (a visual highlight on
//                        an otherwise-still-shown card). Discover's
//                        locationInclude is a genuine restrictive filter
//                        (only matching jobs are returned at all).
//                        Mapping one to the other would turn a
//                        non-exclusionary highlight into results being
//                        hidden - a real change in meaning, not an
//                        adaptation.
//   filterReposted     -> UNSUPPORTED. IndexedJob (Discover's backing
//                        table) has no "reposted" concept at all -
//                        Greenhouse's official API this data comes from
//                        doesn't expose repost history the way
//                        LinkedIn's own UI text does.
//   enableFilters,
//   hideFiltered,
//   showReason         -> UNSUPPORTED (not filter criteria at all - see
//                        below). Left out of the reported/synced set
//                        entirely: these describe how the EXTENSION
//                        behaves locally (whether filtering runs at
//                        all, hide-vs-dim display, whether a filtered
//                        card shows its reason) rather than defining
//                        which jobs to hide/show, so there is no "what
//                        this meant" question to get wrong - they are
//                        simply not filter preferences to import.
const FilterSync = {
  SCHEMA_VERSION: 1,

  // Every filterSettings field that actually describes a filter
  // CRITERION (excludes enableFilters/hideFiltered/showReason - see the
  // header comment above for why those three are out of scope
  // entirely). Kept as an explicit, hand-maintained list - not inferred
  // from filterSettings' keys - so a brand-new extension setting is
  // UNSUPPORTED by default until someone deliberately reviews and adds
  // it here; it can never become "safe" by silent omission.
  SETTINGS_AUDIT: [
    { key: 'maxJobAge', label: 'Maximum job age', supported: true },
    { key: 'includeTitles', label: 'Must Include in Title', supported: true },
    { key: 'excludeTitles', label: 'Exclude from Job Title', supported: true },
    { key: 'excludeLocations', label: 'Exclude Locations', supported: true },
    { key: 'excludeAnywhere', label: 'Exclude from Anywhere (Title, Description, Company)', supported: false },
    { key: 'includeLocations', label: 'Preferred Locations (highlight only)', supported: false },
    { key: 'filterReposted', label: 'Filter out reposted jobs', supported: false },
  ],

  // The exact, explicit, versioned shape sent to job-saver-web - see
  // that repo's lib/services/extensionFilterImport.ts for server-side
  // validation of this same shape. Deliberately only ever these 5
  // fields: no arbitrary/nested structure, nothing that could be
  // mistaken for a raw query object.
  buildSyncPayload(filterSettings) {
    const settings = filterSettings || {};
    return {
      version: FilterSync.SCHEMA_VERSION,
      titleInclude: (settings.includeTitles || []).join(', '),
      titleExclude: (settings.excludeTitles || []).join(', '),
      locationExclude: (settings.excludeLocations || []).join(', '),
      maxPostingAgeDays: typeof settings.maxJobAge === 'number' ? settings.maxJobAge : null,
    };
  },

  // True if `value` (a filterSettings field's current value) actually
  // has meaningful content to report on - an empty array or a
  // false/off boolean means the user never configured that setting, so
  // there is nothing to tell them was "lost".
  hasContent(value) {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'boolean') return value === true;
    if (typeof value === 'number') return value > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    return false;
  },

  // Splits SETTINGS_AUDIT into what actually had content and was sent
  // (by label) vs. what had content but is LinkedIn-only and was never
  // sent (by label) - the two lists Settings' "N filters synced. M
  // LinkedIn-only settings weren't imported." message is built from.
  summarizeSync(filterSettings) {
    const settings = filterSettings || {};
    const synced = [];
    const unsupported = [];

    for (const entry of FilterSync.SETTINGS_AUDIT) {
      if (!FilterSync.hasContent(settings[entry.key])) continue;
      (entry.supported ? synced : unsupported).push(entry.label);
    }

    return { synced, unsupported };
  },
};

// Service-worker / options-page context: importScripts()/<script> share
// the page's global. `globalThis` works in both plus Node.
if (typeof globalThis !== 'undefined') {
  globalThis.FilterSync = FilterSync;
}

// Node context: used by test/filter-sync.test.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FilterSync;
}
