// Universal content script that works across LinkedIn and Built In
// Uses site adapters to handle site-specific logic

let filterSettings = null;
let showFiltered = false;
let profileData = null;
let fieldMappings = {};
let currentAdapter = null;

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
  await loadAutofillData();
  
  const isSearch = currentAdapter.isSearchResultsPage();
  const isDetails = currentAdapter.isJobDetailsPage();
  
  console.log(`Job Saver: isSearch=${isSearch}, isDetails=${isDetails}`);
  
  if (isSearch) {
    initSearchResultsFiltering();
  }
  
  // Show save button on detail pages OR collections pages with currentJobId
  if (isDetails || window.location.href.includes('currentJobId=')) {
    addSaveButton();
  }
  
  // Only init Easy Apply autofill for LinkedIn
  if (SiteAdapters.getCurrentSite() === 'linkedin' && currentAdapter.hasEasyApply()) {
    initEasyApplyAutofill();
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
      minSalary: null,
      maxSalary: null,
      hideNoSalary: false,
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

async function loadAutofillData() {
  try {
    const result = await chrome.storage.local.get(['profileData', 'fieldMappings']);
    profileData = result.profileData || {};
    fieldMappings = result.fieldMappings || {};
  } catch (error) {
    console.error('Job Saver: Error loading autofill data:', error);
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

function addFilterToggleButton() {
  if (document.getElementById('job-filter-toggle')) return;
  
  const toggleContainer = document.createElement('div');
  toggleContainer.id = 'job-filter-toggle';
  toggleContainer.style.cssText = `
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
    max-height: none;
    height: auto;
    overflow: visible;
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
    console.log('Job Saver: Toggle clicked, showFiltered =', showFiltered);
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
  document.body.appendChild(toggleContainer);
}

function applyFiltersToSearchResults(retryCount = 0) {
  console.log('Job Saver: Applying filters');
  
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
        console.log('Job Saver: Showing filtered job (dimmed)');
        card.style.opacity = '0.4';
        card.style.filter = 'grayscale(70%)';
        card.style.display = ''; // Reset display
      } else {
        if (filterSettings.hideFiltered) {
          console.log('Job Saver: Hiding filtered job completely');
          card.style.setProperty('display', 'none', 'important');
        } else {
          console.log('Job Saver: Dimming filtered job');
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
  
  console.log('Job Saver: Evaluating:', { title: title.substring(0, 50) });
  
  // Check exclude filters for title
  for (const keyword of filterSettings.excludeTitles) {
    if (containsKeyword(title, keyword)) {
      result.shouldFilter = true;
      result.reason = `Contains "${keyword}" in title`;
      return result;
    }
  }
  
  // Check exclude filters anywhere (use substring match for company names)
  for (const keyword of filterSettings.excludeAnywhere) {
    // Simple case-insensitive substring match (no word boundaries)
    if (fullText.toLowerCase().includes(keyword.toLowerCase())) {
      result.shouldFilter = true;
      result.reason = `Contains "${keyword}"`;
      return result;
    }
  }
  
  // Check exclude locations
  for (const loc of filterSettings.excludeLocations) {
    if (containsKeyword(fullText, loc)) {
      result.shouldFilter = true;
      result.reason = `Location: ${loc}`;
      return result;
    }
  }
  
  // Check salary filters (Built In only)
  if (SiteAdapters.getCurrentSite() === 'builtin') {
    // Filter jobs with no salary if hideNoSalary is enabled
    if (filterSettings.hideNoSalary && jobData.minSalary === null) {
      result.shouldFilter = true;
      result.reason = 'No salary listed';
      return result;
    }
    
    // Filter jobs below minimum salary
    if (filterSettings.minSalary && jobData.minSalary !== null) {
      if (jobData.minSalary < filterSettings.minSalary) {
        result.shouldFilter = true;
        result.reason = `Salary below $${(filterSettings.minSalary / 1000).toFixed(0)}K (shows ${jobData.salary || 'unknown'})`;
        return result;
      }
    }
    
    // Filter jobs above maximum salary
    if (filterSettings.maxSalary && jobData.minSalary !== null) {
      if (jobData.minSalary > filterSettings.maxSalary) {
        result.shouldFilter = true;
        result.reason = `Salary above $${(filterSettings.maxSalary / 1000).toFixed(0)}K (shows ${jobData.salary || 'unknown'})`;
        return result;
      }
    }
  }
  
  // Check include filters (required keywords in title)
  if (filterSettings.includeTitles.length > 0) {
    let hasRequiredKeyword = false;
    for (const keyword of filterSettings.includeTitles) {
      if (containsKeyword(title, keyword)) {
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
    if (containsKeyword(fullText, loc)) {
      result.isHighlighted = true;
      break;
    }
  }
  
  return result;
}

function containsKeyword(text, keyword) {
  const textLower = text.toLowerCase();
  const keywordLower = keyword.toLowerCase();
  const regex = new RegExp(`\\b${keywordLower}\\b`, 'i');
  return regex.test(textLower);
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

function observeNewJobs() {
  const observer = new MutationObserver(() => {
    if (filterSettings && filterSettings.enableFilters) {
      clearTimeout(window.jobFilterTimeout);
      window.jobFilterTimeout = setTimeout(applyFiltersToSearchResults, 500);
    }
  });
  
  const mainContent = document.querySelector('main') || document.body;
  observer.observe(mainContent, { childList: true, subtree: true });
}

// ============================================
// JOB DETAILS PAGE - SAVE BUTTON
// ============================================

function addSaveButton() {
  if (document.getElementById('job-saver-btn')) return;
  
  const filterPanel = document.getElementById('job-filter-toggle');
  const topPosition = filterPanel ? '340px' : '80px';
  
  const buttonContainer = document.createElement('div');
  buttonContainer.id = 'job-saver-container';
  buttonContainer.style.cssText = `
    position: fixed;
    top: ${topPosition};
    right: 20px;
    z-index: 9999;
    background: white;
    padding: 10px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    display: flex;
    flex-direction: column;
    gap: 8px;
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
  
  const viewSavedBtn = document.createElement('button');
  viewSavedBtn.textContent = '📂 View Saved';
  viewSavedBtn.style.cssText = `
    width: 100%;
    padding: 10px 20px;
    background: #057642;
    color: white;
    border: none;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  `;
  
  viewSavedBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openPopup' });
  });
  
  buttonContainer.appendChild(button);
  buttonContainer.appendChild(viewSavedBtn);
  document.body.appendChild(buttonContainer);
  
  console.log('Job Saver: Save button added successfully');
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

      setTimeout(() => {
        button.textContent = '💾 Save Job';
        button.style.backgroundColor = currentAdapter.color;
      }, 2000);
      return;
    }

    const dedupeKey = window.JobIdentity.storageKey(jobData);
    savedJobs[dedupeKey] = jobData;
    await chrome.storage.local.set({ savedJobs });
    
    console.log('Job Saver: Saved job:', jobData);
    
    button.textContent = '✓ Saved!';
    button.style.backgroundColor = '#057642';
    
    showNotification(`Saved job from ${currentAdapter.name}!`);
    
    setTimeout(() => {
      button.textContent = '💾 Save Job';
      button.style.backgroundColor = currentAdapter.color;
    }, 2000);
    
  } catch (error) {
    console.error('Job Saver: Error saving job:', error);
    button.textContent = '✗ Error';
    button.style.backgroundColor = '#cc1016';
    
    setTimeout(() => {
      button.textContent = '💾 Save Job';
      button.style.backgroundColor = currentAdapter.color;
    }, 2000);
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
// EASY APPLY AUTOFILL (LinkedIn only)
// ============================================

function initEasyApplyAutofill() {
  if (!profileData || !profileData.enableAutofill) {
    console.log('Job Saver: Easy Apply autofill is disabled');
    return;
  }
  
  console.log('Job Saver: Initializing Easy Apply autofill');
  
  observeEasyApplyButtons();
  observeEasyApplyModal();
}

function observeEasyApplyButtons() {
  const easyApplyButtons = document.querySelectorAll('button[aria-label*="Easy Apply"]');
  
  easyApplyButtons.forEach(button => {
    if (!button.dataset.autofillReady) {
      button.dataset.autofillReady = 'true';
      
      const indicator = document.createElement('span');
      indicator.textContent = ' 🤖';
      indicator.title = 'Autofill enabled';
      indicator.style.fontSize = '12px';
      button.appendChild(indicator);
    }
  });
  
  setTimeout(observeEasyApplyButtons, 2000);
}

function observeEasyApplyModal() {
  const observer = new MutationObserver(() => {
    const modal = document.querySelector('[role="dialog"]');
    
    if (modal && !modal.dataset.autofillProcessed) {
      modal.dataset.autofillProcessed = 'true';
      console.log('Job Saver: Easy Apply modal detected');
      
      setTimeout(() => fillEasyApplyForm(modal), 500);
      watchForNextButton(modal);
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

function watchForNextButton(modal) {
  const observer = new MutationObserver(() => {
    const nextButton = modal.querySelector('button[aria-label*="next" i], button[aria-label*="Continue" i]');
    if (nextButton && !nextButton.dataset.watchedForAutofill) {
      nextButton.dataset.watchedForAutofill = 'true';
      nextButton.addEventListener('click', () => {
        setTimeout(() => {
          modal.dataset.autofillProcessed = 'false';
          fillEasyApplyForm(modal);
        }, 1000);
      });
    }
  });
  
  observer.observe(modal, { childList: true, subtree: true });
}

async function fillEasyApplyForm(modal) {
  console.log('Job Saver: Attempting to fill Easy Apply form');
  
  const inputs = modal.querySelectorAll('input, select, textarea');
  let filledCount = 0;
  let unknownFields = [];
  
  inputs.forEach(input => {
    const filled = fillField(input);
    if (filled === true) {
      filledCount++;
    } else if (filled === 'unknown') {
      unknownFields.push(input);
    }
  });
  
  console.log(`Job Saver: Filled ${filledCount} fields`);
  
  if (unknownFields.length > 0) {
    showUnknownFieldsUI(unknownFields, modal);
  }
  
  if (filledCount > 0) {
    showNotification(`✓ Auto-filled ${filledCount} field${filledCount !== 1 ? 's' : ''}`);
  }
}

function fillField(input) {
  if (input.type === 'hidden' || input.disabled) {
    return false;
  }
  
  const label = getFieldLabel(input);
  const labelLower = label.toLowerCase();
  
  if (fieldMappings[label]) {
    const mapping = fieldMappings[label];
    
    if (mapping.startsWith('profile:')) {
      const profileKey = mapping.replace('profile:', '');
      fillWithProfileData(input, profileKey);
    } else {
      fillWithCustomText(input, mapping);
    }
    return true;
  }
  
  const isGenericQuestion = !labelLower.includes('startup') && 
                           !labelLower.includes('recruiting') &&
                           !labelLower.includes('technical') &&
                           !labelLower.includes('with ') &&
                           !labelLower.includes('in ');
  
  if (isGenericQuestion) {
    if (labelLower.includes('first name') || labelLower === 'first') {
      fillWithProfileData(input, 'firstName');
      return true;
    }
    
    if (labelLower.includes('last name') || labelLower === 'last') {
      fillWithProfileData(input, 'lastName');
      return true;
    }
    
    if (labelLower.includes('email')) {
      fillWithProfileData(input, 'email');
      return true;
    }
    
    if (labelLower.includes('phone') || labelLower.includes('mobile')) {
      fillWithProfileData(input, 'phone');
      return true;
    }
  }
  
  return 'unknown';
}

function getFieldLabel(input) {
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) return label.textContent.trim();
  }
  
  if (input.getAttribute('aria-label')) {
    return input.getAttribute('aria-label').trim();
  }
  
  if (input.placeholder) {
    return input.placeholder.trim();
  }
  
  return input.name || 'unknown field';
}

function fillWithProfileData(input, profileKey) {
  const value = profileData[profileKey];
  
  if (!value) {
    return;
  }
  
  if (input.tagName === 'SELECT') {
    const options = Array.from(input.options);
    const match = options.find(opt => 
      opt.value === value || 
      opt.textContent.toLowerCase().includes(value.toLowerCase())
    );
    if (match) {
      input.value = match.value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } else {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function fillWithCustomText(input, text) {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function showUnknownFieldsUI(unknownFields, modal) {
  saveUnknownFields(unknownFields);
  
  const existing = document.getElementById('job-saver-unknown-fields');
  if (existing) existing.remove();
  
  const container = document.createElement('div');
  container.id = 'job-saver-unknown-fields';
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #fff3cd;
    border: 2px solid #ffc107;
    border-radius: 8px;
    padding: 15px;
    max-width: 400px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 10000;
  `;
  
  const title = document.createElement('div');
  title.textContent = '🤖 New Fields Detected';
  title.style.cssText = 'font-weight: 600; margin-bottom: 10px; font-size: 14px;';
  
  const description = document.createElement('div');
  description.textContent = `Found ${unknownFields.length} new field${unknownFields.length !== 1 ? 's' : ''}. Fill them manually this time, then teach the extension in settings!`;
  description.style.cssText = 'font-size: 12px; color: #666; margin-bottom: 10px;';
  
  const buttonGroup = document.createElement('div');
  buttonGroup.style.cssText = 'display: flex; gap: 8px;';
  
  const teachBtn = document.createElement('button');
  teachBtn.textContent = '🎓 Open Settings';
  teachBtn.style.cssText = `
    background: #0a66c2;
    color: white;
    border: none;
    padding: 8px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    flex: 1;
  `;
  teachBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openOptions' });
    container.remove();
  });
  
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Got it';
  closeBtn.style.cssText = `
    background: #666;
    color: white;
    border: none;
    padding: 8px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    flex: 1;
  `;
  closeBtn.addEventListener('click', () => container.remove());
  
  buttonGroup.appendChild(teachBtn);
  buttonGroup.appendChild(closeBtn);
  
  container.appendChild(title);
  container.appendChild(description);
  container.appendChild(buttonGroup);
  
  document.body.appendChild(container);
  
  setTimeout(() => {
    if (container.parentElement) container.remove();
  }, 15000);
}

async function saveUnknownFields(unknownFields) {
  try {
    const result = await chrome.storage.local.get(['unknownFields']);
    const existing = result.unknownFields || [];
    
    unknownFields.forEach(field => {
      const label = getFieldLabel(field);
      if (!existing.includes(label)) {
        existing.push(label);
      }
    });
    
    await chrome.storage.local.set({ unknownFields: existing });
  } catch (error) {
    console.error('Job Saver: Error saving unknown fields:', error);
  }
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
