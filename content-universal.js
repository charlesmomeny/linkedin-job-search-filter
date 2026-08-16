// Universal content script that works on LinkedIn
// Uses site adapters to handle site-specific logic

let filterSettings = null;
let showFiltered = false;
let currentAdapter = null;

// Recurring-resource references. Repeated init() calls (LinkedIn's SPA
// navigation re-runs init() without a full page reload) must reuse or
// cleanly replace these instead of accumulating duplicates - see
// observeNewJobs() below.
let jobListObserver = null;
let jobListObserverTarget = null;

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  // Get the appropriate site adapter
  currentAdapter = SiteAdapters.getAdapter();
  
  if (!currentAdapter) {
    console.log('Job Saver: Unsupported site');
    return;
  }
  
  console.log(`Job Saver: Initializing for ${currentAdapter.name}`);
  
  await loadFilterSettings();

  const isSearch = currentAdapter.isSearchResultsPage();
  const isDetails = currentAdapter.isJobDetailsPage();

  if (isSearch) {
    initSearchResultsFiltering();
  }
  
  // Show save controls on detail pages OR collections pages with
  // currentJobId. Re-runs on every init() (including SPA navigation),
  // so the current-job section always reflects whichever job is
  // active now, not just the first one seen.
  if (isDetails || window.location.href.includes('currentJobId=')) {
    await updateJobSection();
  } else {
    removeJobSection();
  }
}

async function loadFilterSettings() {
  try {
    const result = await chrome.storage.local.get(['filterSettings']);
    filterSettings = result.filterSettings || {
      enableFilters: false,
      hideFiltered: true,
      showReason: true,
      filterReposted: false,
      maxJobAge: null,
      excludeTitles: [],
      excludeAnywhere: [],
      excludeLocations: [],
      includeTitles: [],
      includeLocations: []
    };
  } catch (error) {
    console.error('Job Saver: Error loading filter settings:', error);
  }
}

// ============================================
// SEARCH RESULTS FILTERING
// ============================================

function initSearchResultsFiltering() {
  if (!filterSettings || !filterSettings.enableFilters) {
    console.log('Job Saver: Filtering disabled');
    return;
  }
  
  console.log('Job Saver: Initializing search results filtering');
  
  addFilterToggleButton();
  
  // Wait a bit for page to load, then apply filters with retry capability
  setTimeout(() => {
    applyFiltersToSearchResults(0); // Start with retry count 0
    observeNewJobs();
  }, 1000);
}

// ============================================
// SHARED EXTENSION PANEL
//
// A single floating panel hosts both the search-results filter
// controls and the current-job save control, instead of two separate
// floating containers. Each section manages its own content; only the
// outer panel's position/background/shadow live here.
// ============================================

function ensureExtensionPanel() {
  let panel = document.getElementById('job-saver-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'job-saver-panel';
    panel.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 9999;
      background: white;
      padding: 12px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 200px;
    `;
    document.body.appendChild(panel);
  }
  return panel;
}

function removePanelIfEmpty() {
  const panel = document.getElementById('job-saver-panel');
  if (panel && panel.children.length === 0) {
    panel.remove();
  }
}

function addFilterToggleButton() {
  if (document.getElementById('job-filter-toggle')) return;

  const panel = ensureExtensionPanel();

  const toggleContainer = document.createElement('div');
  toggleContainer.id = 'job-filter-toggle';
  toggleContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;

  const title = document.createElement('div');
  title.textContent = `🎯 ${currentAdapter.name} Filters`;
  title.style.cssText = 'font-weight: 600; font-size: 14px; margin-bottom: 4px;';
  
  const stats = document.createElement('div');
  stats.id = 'filter-stats';
  stats.style.cssText = 'font-size: 12px; color: #666;';
  
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'toggle-filtered-btn';
  toggleBtn.textContent = showFiltered ? '👁️ Hide Filtered' : '👁️ Show Filtered';
  toggleBtn.style.cssText = `
    background: ${currentAdapter.color};
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    width: 100%;
  `;
  
  toggleBtn.addEventListener('click', () => {
    showFiltered = !showFiltered;
    toggleBtn.textContent = showFiltered ? '👁️ Hide Filtered' : '👁️ Show Filtered';
    applyFiltersToSearchResults();
  });
  
  const viewSavedBtn = document.createElement('button');
  viewSavedBtn.textContent = '📂 View Saved Jobs';
  viewSavedBtn.style.cssText = `
    background: #057642;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    width: 100%;
  `;
  
  viewSavedBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openPopup' });
  });
  
  const settingsBtn = document.createElement('button');
  settingsBtn.textContent = '⚙️ Filter Settings';
  settingsBtn.style.cssText = `
    background: #666;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    width: 100%;
  `;
  
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openOptions' });
  });
  
  toggleContainer.appendChild(title);
  toggleContainer.appendChild(stats);
  toggleContainer.appendChild(toggleBtn);
  toggleContainer.appendChild(viewSavedBtn);
  toggleContainer.appendChild(settingsBtn);
  panel.appendChild(toggleContainer);

  syncJobSectionChrome();
}

function applyFiltersToSearchResults(retryCount = 0) {
  const jobCards = currentAdapter.getJobCards();
  console.log('Job Saver: Found', jobCards.length, 'job cards');
  
  // If no cards found and haven't retried too many times, retry after a delay
  if (jobCards.length === 0 && retryCount < 3) {
    console.log(`Job Saver: No cards found, retrying in 1 second... (attempt ${retryCount + 1}/3)`);
    setTimeout(() => {
      applyFiltersToSearchResults(retryCount + 1);
    }, 1000);
    return;
  }
  
  if (jobCards.length === 0) {
    console.log('Job Saver: No job cards found after 3 retries. Page may not have loaded yet or layout has changed.');
    return;
  }
  
  let filteredCount = 0;
  let totalCount = jobCards.length;
  
  jobCards.forEach(card => {
    const filterResult = evaluateJobCard(card);
    
    if (filterResult.shouldFilter) {
      filteredCount++;
      
      if (showFiltered) {
        card.style.opacity = '0.4';
        card.style.filter = 'grayscale(70%)';
        card.style.display = ''; // Reset display
      } else {
        if (filterSettings.hideFiltered) {
          card.style.setProperty('display', 'none', 'important');
        } else {
          card.style.opacity = '0.3';
          card.style.filter = 'grayscale(100%)';
          card.style.display = ''; // Reset display
        }
      }
      
      if (filterSettings.showReason) {
        card.title = `Filtered: ${filterResult.reason}`;
        card.style.cursor = 'help';
      }
      
      addFilterBadge(card, filterResult.reason);
      
    } else {
      card.style.opacity = '1';
      card.style.filter = 'none';
      card.style.setProperty('display', '', 'important');
      card.style.border = '';
      removeFilterBadge(card);
      
      if (filterResult.isHighlighted) {
        card.style.border = '2px solid #057642';
        card.style.borderRadius = '8px';
      }
    }
  });
  
  updateFilterStats(totalCount, filteredCount);
}

function evaluateJobCard(card) {
  const result = {
    shouldFilter: false,
    isHighlighted: false,
    reason: ''
  };
  
  const jobData = currentAdapter.extractJobDataFromCard(card);
  const title = jobData.title.toLowerCase();
  const fullText = jobData.fullText;

  // Check exclude filters for title
  for (const keyword of filterSettings.excludeTitles) {
    if (window.KeywordMatching.containsKeyword(title, keyword)) {
      result.shouldFilter = true;
      result.reason = `Contains "${keyword}" in title`;
      return result;
    }
  }
  
  // Check exclude filters anywhere (title, company, location, etc.)
  for (const keyword of filterSettings.excludeAnywhere) {
    // Same safe, literal whole-word matching as the other keyword
    // filters (Package 3) - previously a raw substring check, so
    // excluding "art" would also match "start", "smart", "party".
    if (window.KeywordMatching.containsKeyword(fullText, keyword)) {
      result.shouldFilter = true;
      result.reason = `Contains "${keyword}"`;
      return result;
    }
  }
  
  // Check exclude locations
  for (const loc of filterSettings.excludeLocations) {
    if (window.KeywordMatching.containsKeyword(fullText, loc)) {
      result.shouldFilter = true;
      result.reason = `Location: ${loc}`;
      return result;
    }
  }

  // Filter reposted listings. jobData.isReposted is only populated by
  // adapters that can detect it from card text (currently LinkedIn);
  // it's simply undefined/false elsewhere, so this has no effect on
  // sites that don't support it.
  if (filterSettings.filterReposted && jobData.isReposted) {
    result.shouldFilter = true;
    result.reason = 'Reposted listing';
    return result;
  }

  // Filter jobs older than the configured maximum age. postedDaysAgo
  // is null when it couldn't be determined from the card text - such
  // jobs are never filtered by age (fail open, don't hide a job we
  // can't confidently classify).
  if (filterSettings.maxJobAge && jobData.postedDaysAgo !== null && jobData.postedDaysAgo !== undefined) {
    if (jobData.postedDaysAgo > filterSettings.maxJobAge) {
      result.shouldFilter = true;
      result.reason = `Posted ${jobData.postedDaysAgo} day${jobData.postedDaysAgo !== 1 ? 's' : ''} ago (max ${filterSettings.maxJobAge})`;
      return result;
    }
  }

  // Check include filters (required keywords in title)
  if (filterSettings.includeTitles.length > 0) {
    let hasRequiredKeyword = false;
    for (const keyword of filterSettings.includeTitles) {
      if (window.KeywordMatching.containsKeyword(title, keyword)) {
        hasRequiredKeyword = true;
        break;
      }
    }
    if (!hasRequiredKeyword) {
      result.shouldFilter = true;
      result.reason = 'Missing required keywords in title';
      return result;
    }
  }
  
  // Check if job should be highlighted
  for (const loc of filterSettings.includeLocations) {
    if (window.KeywordMatching.containsKeyword(fullText, loc)) {
      result.isHighlighted = true;
      break;
    }
  }
  
  return result;
}

function addFilterBadge(card, reason) {
  removeFilterBadge(card);
  
  const badge = document.createElement('div');
  badge.className = 'job-filter-badge';
  badge.textContent = '🚫 Filtered';
  badge.title = reason;
  badge.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    background: #cc1016;
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    z-index: 10;
  `;
  
  card.style.position = 'relative';
  card.appendChild(badge);
}

function removeFilterBadge(card) {
  const badge = card.querySelector('.job-filter-badge');
  if (badge) badge.remove();
}

function updateFilterStats(total, filtered) {
  const statsElement = document.getElementById('filter-stats');
  if (statsElement) {
    const visible = total - filtered;
    statsElement.textContent = `${visible} visible / ${filtered} filtered`;
  }
}

// True if `node` is part of the extension's own injected UI (the
// shared panel, or a filter badge attached to a job card) rather than
// LinkedIn's own content.
function isExtensionOwnedNode(node) {
  if (!node || node.nodeType !== 1) return false; // only Elements can be confidently "ours"
  if (typeof node.closest !== 'function') return false;
  if (node.closest('#job-saver-panel')) return true;
  if (typeof node.matches === 'function' && node.matches('.job-filter-badge')) return true;
  return false;
}

// A childList mutation counts as extension-owned only when every node
// it added/removed is our own (e.g. a filter badge being appended to
// or removed from a real job card - the mutation's target is the job
// card itself, which is why this checks addedNodes/removedNodes, not
// just the target).
function isExtensionOwnedMutation(mutation) {
  if (isExtensionOwnedNode(mutation.target)) return true;
  const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
  if (changedNodes.length === 0) return false;
  return changedNodes.every(isExtensionOwnedNode);
}

// Idempotent: repeated calls (once per SPA-navigation init() pass)
// reuse the existing observer when it's already watching the current
// content root, and cleanly disconnect-and-replace it only if that
// root node changed (e.g. LinkedIn swapped out <main>) - so this never
// stacks additional observers on top of prior ones.
function observeNewJobs() {
  const mainContent = document.querySelector('main') || document.body;
  const action = window.LifecycleUtils.decideResourceAction(jobListObserverTarget, mainContent);

  if (action === 'reuse') return;

  if (jobListObserver) {
    jobListObserver.disconnect();
  }

  jobListObserver = new MutationObserver((mutations) => {
    // Ignore mutation batches that are entirely the extension's own
    // badge/panel writes, so applying filters never re-triggers itself
    // purely from its own DOM changes.
    const ownershipFlags = mutations.map(isExtensionOwnedMutation);
    if (!window.LifecycleUtils.isExternalChange(ownershipFlags)) return;

    if (filterSettings && filterSettings.enableFilters) {
      clearTimeout(window.jobFilterTimeout);
      window.jobFilterTimeout = setTimeout(applyFiltersToSearchResults, 500);
    }
  });

  jobListObserverTarget = mainContent;
  jobListObserver.observe(mainContent, { childList: true, subtree: true });
}

// ============================================
// JOB DETAILS - CURRENT JOB SECTION (in the shared panel)
// ============================================

// Creates the current-job section inside the shared panel the first
// time it's needed, then - on every call, including re-runs from
// SPA navigation - refreshes it to reflect whichever job is active
// now. This is what makes moving from Job A to Job B correctly update
// the existing control instead of leaving a stale one behind.
async function updateJobSection() {
  const panel = ensureExtensionPanel();

  let section = document.getElementById('job-saver-section');
  if (!section) {
    section = document.createElement('div');
    section.id = 'job-saver-section';
    section.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    const label = document.createElement('div');
    label.id = 'job-saver-label';
    label.textContent = 'CURRENT JOB';
    label.style.cssText = `
      font-size: 11px;
      font-weight: 600;
      color: #888;
      letter-spacing: 0.5px;
    `;

    const button = document.createElement('button');
    button.id = 'job-saver-btn';
    button.className = 'job-saver-button';
    button.textContent = '💾 Save Job';
    button.style.cssText = `
      width: 100%;
      padding: 10px 20px;
      background: ${currentAdapter.color};
      color: white;
      border: none;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    `;
    button.addEventListener('click', saveCurrentJob);

    section.appendChild(label);
    section.appendChild(button);
    panel.appendChild(section);

    console.log('Job Saver: Job section added to shared panel');
  }

  // View Saved Jobs must exist exactly once in the panel. The filter
  // section already provides it when present; only add/remove this
  // section's own copy to match whether that's currently the case.
  syncJobSectionChrome();

  await refreshJobSectionState();
}

function removeJobSection() {
  const section = document.getElementById('job-saver-section');
  if (section) section.remove();
  removePanelIfEmpty();
}

// Keeps the job section's separator/label border and its own "View
// Saved Jobs" button in sync with whether the filter section is
// currently present in the shared panel, so the button never appears
// twice and the separator only shows when there's a filter section
// above it to separate from.
function syncJobSectionChrome() {
  const section = document.getElementById('job-saver-section');
  if (!section) return;

  const hasFilterSection = !!document.getElementById('job-filter-toggle');

  const label = document.getElementById('job-saver-label');
  if (label) {
    label.style.borderTop = hasFilterSection ? '1px solid #e5e5e5' : 'none';
    label.style.paddingTop = hasFilterSection ? '8px' : '0';
  }

  const ownViewSavedBtn = document.getElementById('job-section-view-saved-btn');
  if (hasFilterSection && ownViewSavedBtn) {
    ownViewSavedBtn.remove();
  } else if (!hasFilterSection && !ownViewSavedBtn) {
    const viewSavedBtn = document.createElement('button');
    viewSavedBtn.id = 'job-section-view-saved-btn';
    viewSavedBtn.textContent = '📂 View Saved Jobs';
    viewSavedBtn.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      background: #057642;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    `;
    viewSavedBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openPopup' });
    });
    section.appendChild(viewSavedBtn);
  }
}

// Sets the Save Job button's persistent label/color to reflect
// whether the currently active job is already saved.
async function refreshJobSectionState() {
  const button = document.getElementById('job-saver-btn');
  if (!button || !currentAdapter) return;

  try {
    const jobData = currentAdapter.extractJobData();
    const result = await chrome.storage.local.get(['savedJobs']);
    const savedJobs = result.savedJobs || {};
    const isSaved = !!window.JobIdentity.findExistingKey(savedJobs, jobData);

    button.textContent = isSaved ? '✓ Saved' : '💾 Save Job';
    button.style.backgroundColor = isSaved ? '#057642' : currentAdapter.color;
  } catch (error) {
    console.error('Job Saver: Error checking saved state:', error);
    button.textContent = '💾 Save Job';
    button.style.backgroundColor = currentAdapter.color;
  }
}

async function saveCurrentJob() {
  const button = document.getElementById('job-saver-btn');
  
  try {
    const jobData = currentAdapter.extractJobData();
    
    if (!jobData.title && !jobData.company && !jobData.jobId) {
      alert('Could not extract job details. Make sure the page is fully loaded.');
      return;
    }
    
    if (!jobData.title) jobData.title = 'Job Title Not Found';
    if (!jobData.company) jobData.company = 'Company Not Found';
    
    const result = await chrome.storage.local.get(['savedJobs']);
    const savedJobs = result.savedJobs || {};

    // Compare by canonical identity (source + jobId, or a normalized
    // title/company/location fallback) rather than a single recomputed
    // key, so a job already saved under any historical key format
    // (organic save, older import) is still recognized as "already
    // saved" instead of being duplicated under a new key.
    const existingKey = window.JobIdentity.findExistingKey(savedJobs, jobData);

    if (existingKey) {
      const existingJob = savedJobs[existingKey];
      const savedDate = new Date(existingJob.dateSaved).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      button.textContent = '✓ Already Saved';
      button.style.backgroundColor = currentAdapter.color;

      showNotification(`You already saved this job on ${savedDate}`);

      setTimeout(refreshJobSectionState, 2000);
      return;
    }

    const dedupeKey = window.JobIdentity.storageKey(jobData);
    savedJobs[dedupeKey] = jobData;
    await chrome.storage.local.set({ savedJobs });
    
    console.log('Job Saver: Saved job:', jobData);
    
    button.textContent = '✓ Saved!';
    button.style.backgroundColor = '#057642';
    
    showNotification(`Saved job from ${currentAdapter.name}!`);

    setTimeout(refreshJobSectionState, 2000);

  } catch (error) {
    console.error('Job Saver: Error saving job:', error);
    button.textContent = '✗ Error';
    button.style.backgroundColor = '#cc1016';

    setTimeout(refreshJobSectionState, 2000);
  }
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #057642;
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 10000;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.transition = 'opacity 0.3s';
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ============================================
// START EVERYTHING
// ============================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Watch for URL changes (SPAs)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(init, 1000);
  }
}).observe(document, { subtree: true, childList: true });
