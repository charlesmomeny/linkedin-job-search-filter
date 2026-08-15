// Shared, dependency-free saved-job identity helpers.
//
// Loaded as a plain classic script in every context that needs to reason
// about which storage entry a job belongs to: the content-script world
// (via manifest.json's content_scripts) and the popup page (via a
// <script> tag in popup.html, before popup.js). This is the single place
// dedupe/identity logic lives, so the content script, popup, and CSV
// import can no longer drift into different key formats the way
// content-universal.js and popup.js previously did independently.
//
// Two distinct concepts on purpose:
//   - storageKey(job): the string a NEW job is written under in
//     chrome.storage.local's savedJobs map. Unchanged from
//     content-universal.js's original algorithm, so every job already
//     saved by existing users keeps working with no migration.
//   - canonicalId(job) / findExistingKey(savedJobs, job): used only to
//     compare two job representations for exact-duplicate purposes.
//     Deletion and "already saved" checks must always use the REAL
//     persisted object key (whatever historical format produced it),
//     never a recomputed key - findExistingKey returns that real key.

const JobIdentity = {
  normalizeText(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  },

  normalizeSource(source) {
    return this.normalizeText(source);
  },

  // Slash-style job IDs (e.g. historical Himalayas records, whose site
  // adapter has since been removed) may contain "/", or may have been
  // rewritten to "_" by historical popup CSV-import code. Collapse both
  // to the same separator so identity comparison stays stable for any
  // such record regardless of which normalization produced it - this
  // is generic, not specific to any one currently-supported site.
  normalizeJobId(jobId) {
    return String(jobId).trim().toLowerCase().replace(/[\/_]+/g, '/');
  },

  // Canonical identity signature for a job-like object
  // ({ source, jobId, title, company, location }). Two jobs with the
  // same signature are treated as the same real-world job. Exact
  // matching only - no fuzzy/similarity comparison.
  canonicalId(job) {
    const source = this.normalizeSource(job && job.source);

    if (job && job.jobId) {
      return `${source}::id::${this.normalizeJobId(job.jobId)}`;
    }

    const title = this.normalizeText(job && job.title);
    const company = this.normalizeText(job && job.company);
    const location = this.normalizeText(job && job.location);
    return `${source}::fallback::${title}::${company}::${location}`;
  },

  // The key a NEW job should be stored under. Identical to
  // content-universal.js's original generateDedupeKey() algorithm -
  // preserved as-is so existing storage keys remain valid.
  storageKey(job) {
    const source = (job && job.source) || 'Unknown';

    if (job && job.jobId) {
      return `${source}_${job.jobId}`;
    }

    const title = (job && job.title) || '';
    const company = (job && job.company) || '';
    const location = (job && job.location) || '';
    return `${source}_${title}_${company}_${location}`
      .toLowerCase()
      .replace(/\s+/g, '_');
  },

  // Returns the ACTUAL storage key of an existing entry in `savedJobs`
  // that matches `job` by canonical identity, or null if there is no
  // match. `savedJobs` is the object as persisted in
  // chrome.storage.local (real keys -> job objects), so this works
  // uniformly across any historical key format those entries were
  // originally written under.
  findExistingKey(savedJobs, job) {
    const targetId = this.canonicalId(job);
    for (const key of Object.keys(savedJobs || {})) {
      if (this.canonicalId(savedJobs[key]) === targetId) {
        return key;
      }
    }
    return null;
  }
};

// Content-script / popup-page context: classic script, shared `window`.
if (typeof window !== 'undefined') {
  window.JobIdentity = JobIdentity;
}

// Node context: used by test/job-identity.test.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JobIdentity;
}
