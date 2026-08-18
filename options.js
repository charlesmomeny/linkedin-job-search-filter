// Options page logic for managing filter settings

// Default filter settings
const defaultSettings = {
  enableFilters: true,
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

// Load saved settings when page opens
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadDashboardConnection();

  // Set up event listeners
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('resetBtn').addEventListener('click', resetSettings);
  document.getElementById('saveConnectionBtn').addEventListener('click', saveDashboardConnection);
  document.getElementById('testConnectionBtn').addEventListener('click', testDashboardConnection);
  document.getElementById('syncDashboardBtn').addEventListener('click', runDashboardReconciliation);
  document.getElementById('syncFiltersBtn').addEventListener('click', runFilterSync);
  document.getElementById('reconcileCancelBtn').addEventListener('click', cancelRemovalConfirmation);
  document.getElementById('reconcileApproveBtn').addEventListener('click', approveRemovals);
  document.getElementById('disconnectBtn').addEventListener('click', disconnectDashboard);
});

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['filterSettings']);
    const settings = result.filterSettings || defaultSettings;

    // Populate filter form fields
    document.getElementById('enableFilters').checked = settings.enableFilters;
    document.getElementById('hideFiltered').checked = settings.hideFiltered;
    document.getElementById('showReason').checked = settings.showReason;
    document.getElementById('filterReposted').checked = settings.filterReposted || false;
    document.getElementById('maxJobAge').value = settings.maxJobAge || '';

    document.getElementById('excludeTitles').value = (settings.excludeTitles || []).join('\n');
    document.getElementById('excludeAnywhere').value = (settings.excludeAnywhere || []).join('\n');
    document.getElementById('excludeLocations').value = (settings.excludeLocations || []).join('\n');
    document.getElementById('includeTitles').value = (settings.includeTitles || []).join('\n');
    document.getElementById('includeLocations').value = (settings.includeLocations || []).join('\n');

  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Failed to load settings', 'error');
  }
}

async function saveSettings() {
  try {
    // Get filter values from form
    const settings = {
      enableFilters: document.getElementById('enableFilters').checked,
      hideFiltered: document.getElementById('hideFiltered').checked,
      showReason: document.getElementById('showReason').checked,
      filterReposted: document.getElementById('filterReposted').checked,
      maxJobAge: document.getElementById('maxJobAge').value ? parseInt(document.getElementById('maxJobAge').value) : null,
      excludeTitles: textareaToArray('excludeTitles'),
      excludeAnywhere: textareaToArray('excludeAnywhere'),
      excludeLocations: textareaToArray('excludeLocations'),
      includeTitles: textareaToArray('includeTitles'),
      includeLocations: textareaToArray('includeLocations')
    };

    // Save to storage
    await chrome.storage.local.set({ filterSettings: settings });

    showStatus('✓ Settings saved successfully! Refresh LinkedIn to apply changes.', 'success');
    
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('Failed to save settings: ' + error.message, 'error');
  }
}

async function resetSettings() {
  if (!confirm('Reset all filter settings to defaults?')) return;
  
  try {
    await chrome.storage.local.set({ filterSettings: defaultSettings });
    await loadSettings();
    showStatus('Settings reset to defaults', 'success');
  } catch (error) {
    console.error('Error resetting settings:', error);
    showStatus('Failed to reset settings', 'error');
  }
}

function textareaToArray(textareaId) {
  const value = document.getElementById(textareaId).value;
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';

  // Hide after 5 seconds
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 5000);
}

// ============================================
// DASHBOARD SYNC (optional)
//
// Local job saving works identically with or without this configured -
// see content-universal.js's syncJobToDashboard(), which only fires a
// best-effort background sync after a local save has already
// succeeded. The token here is never displayed again after entry
// (masked to its last 4 characters), never logged, and never leaves
// this browser except as the Authorization header on a sync request.
// ============================================

function maskToken(token) {
  if (!token || token.length < 8) return '••••••••';
  return `••••••••${token.slice(-4)}`;
}

async function loadDashboardConnection() {
  const result = await chrome.storage.local.get(['dashboardConnection']);
  const connection = result.dashboardConnection;

  const urlInput = document.getElementById('dashboardUrl');
  const tokenInput = document.getElementById('dashboardToken');
  const hint = document.getElementById('dashboardTokenHint');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const testConnectionBtn = document.getElementById('testConnectionBtn');
  const syncDashboardBtn = document.getElementById('syncDashboardBtn');
  const syncFiltersBtn = document.getElementById('syncFiltersBtn');
  const statusLine = document.getElementById('connectionStatusLine');

  tokenInput.value = '';
  hideReconcileResult();
  hideFilterSyncResult();

  if (!connection) {
    urlInput.value = '';
    tokenInput.placeholder = 'Paste the token from your dashboard';
    hint.textContent = '';
    disconnectBtn.style.display = 'none';
    testConnectionBtn.style.display = 'none';
    syncDashboardBtn.style.display = 'none';
    syncFiltersBtn.style.display = 'none';
    statusLine.textContent = 'Not configured. Local job saving is unaffected either way.';
    return;
  }

  urlInput.value = connection.dashboardUrl;
  tokenInput.placeholder = maskToken(connection.token);
  hint.textContent = 'A token is already saved - leave this blank to keep it, or paste a new one to replace it.';
  disconnectBtn.style.display = '';
  testConnectionBtn.style.display = '';
  syncDashboardBtn.style.display = '';
  syncFiltersBtn.style.display = '';
  statusLine.textContent = describeConnectionStatus(connection);
}

function describeConnectionStatus(connection) {
  if (!connection.lastSyncAt) {
    return 'Configured - not yet synced. It will be tried the next time you save a job.';
  }
  const when = new Date(connection.lastSyncAt).toLocaleString();
  return connection.lastSyncOk
    ? `Configured - last sync succeeded (${when}).`
    : `Configured - last sync failed (${when}). Double-check the URL/token, or that the token hasn't been revoked from the dashboard.`;
}

async function saveDashboardConnection() {
  const rawUrl = document.getElementById('dashboardUrl').value.trim();
  const rawToken = document.getElementById('dashboardToken').value.trim();

  if (!rawUrl) {
    showDashboardStatus('Enter a Dashboard URL', 'error');
    return;
  }

  if (!window.UrlUtils.isSafeJobUrl(rawUrl)) {
    showDashboardStatus('Dashboard URL must be a valid http:// or https:// address', 'error');
    return;
  }

  const origin = new URL(rawUrl).origin;

  // MV3 least-privilege: this extension has no static host permission
  // for arbitrary dashboards. Instead, request permission for exactly
  // this one origin, only when the user explicitly saves it here -
  // requested as early as possible in this handler, since the prompt
  // requires an active user gesture.
  let granted;
  try {
    granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  } catch (error) {
    showDashboardStatus('Could not request permission for that URL.', 'error');
    return;
  }

  if (!granted) {
    showDashboardStatus('Permission for that URL was not granted, so the connection was not saved.', 'error');
    return;
  }

  let token = rawToken;
  if (!token) {
    const existing = (await chrome.storage.local.get(['dashboardConnection'])).dashboardConnection;
    token = existing && existing.token;
  }

  if (!token) {
    showDashboardStatus('Enter the Extension Token from your dashboard', 'error');
    await chrome.permissions.remove({ origins: [`${origin}/*`] }).catch(() => {});
    return;
  }

  await chrome.storage.local.set({
    dashboardConnection: {
      dashboardUrl: origin,
      token,
      // Any change (URL or token) invalidates whatever the previous
      // sync status meant, so it isn't carried forward.
      lastSyncAt: null,
      lastSyncOk: null,
    },
  });

  await loadDashboardConnection();
  showDashboardStatus('✓ Connection saved', 'success');
}

async function testDashboardConnection() {
  const testBtn = document.getElementById('testConnectionBtn');
  testBtn.disabled = true;
  testBtn.textContent = '📡 Testing...';

  try {
    const response = await sendMessagePromise({ action: 'testDashboardConnection' });
    showDashboardStatus(describeTestResult(response), response && response.ok ? 'success' : 'error');
  } catch (error) {
    // Background script unreachable - never surfaced as anything to
    // do with the token/dashboard itself.
    showDashboardStatus('Could not run the connection test right now.', 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = '📡 Test Connection';
    await loadDashboardConnection();
  }
}

// Maps a DashboardSync.testConnection() result to the four states
// Settings needs to distinguish: not configured, success,
// invalid/revoked token, and network/unreachable error.
function describeTestResult(result) {
  if (!result) return 'Connection test failed.';

  if (result.ok) {
    return result.email ? `✓ Connected as ${result.email}` : '✓ Connection working';
  }

  switch (result.reason) {
    case 'not-configured':
      return 'Save a connection first.';
    case 'unauthorized':
      return '✗ Token invalid or revoked - generate a new one from the dashboard.';
    case 'network-error':
      return '✗ Could not reach the dashboard - check the URL and your network connection.';
    case 'invalid-url':
      return '✗ Dashboard URL is not valid.';
    default:
      return `✗ Connection test failed${result.status ? ` (HTTP ${result.status})` : ''}.`;
  }
}

function sendMessagePromise(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function disconnectDashboard() {
  if (!confirm('Remove the Dashboard Sync connection? Jobs will only be saved locally afterward.')) return;

  const existing = (await chrome.storage.local.get(['dashboardConnection'])).dashboardConnection;
  await chrome.storage.local.remove('dashboardConnection');

  if (existing && existing.dashboardUrl) {
    // Relinquish the granted host permission too - least privilege
    // applies to cleanup, not just acquisition.
    await chrome.permissions.remove({ origins: [`${existing.dashboardUrl}/*`] }).catch(() => {});
  }

  await loadDashboardConnection();
  showDashboardStatus('Connection removed', 'success');
}

function showDashboardStatus(message, type) {
  const statusDiv = document.getElementById('dashboardStatus');
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';

  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 5000);
}

// ============================================
// DASHBOARD RECONCILIATION (manual, explicit-approval-only)
//
// "Sync Dashboard" pushes every currently-saved job (best-effort, same
// per-job sync used automatically after each local save - see
// background.js's 'syncDashboard' handler) and then requests a
// read-only preview of dashboard entries that no longer match any
// locally saved job by exact source+sourceJobId identity. Nothing is
// ever deleted without a separate, explicit "Approve removal" click on
// exactly the candidates the preview returned - see approveRemovals().
// A dashboard/network failure anywhere in this flow only ever produces
// an inline message here; it never touches local saved-job storage.
// ============================================

// Holds the exact removalCandidates array the last preview returned,
// so approveRemovals() can send it back unmodified rather than
// reconstructing candidate ids client-side. Cleared on Cancel and
// whenever a new message replaces the confirmation.
let pendingRemovalCandidates = null;

async function runDashboardReconciliation() {
  const syncBtn = document.getElementById('syncDashboardBtn');
  syncBtn.disabled = true;
  syncBtn.textContent = '🔄 Syncing...';
  hideReconcileResult();

  try {
    const result = await sendMessagePromise({ action: 'syncDashboard' });
    handlePreviewResult(result);
  } catch (error) {
    // Background script unreachable - never surfaced as anything to do
    // with the token/dashboard itself, and never touches local saves.
    showReconcileMessage('Could not run Sync Dashboard right now.');
  } finally {
    syncBtn.disabled = false;
    syncBtn.textContent = '🔄 Sync Dashboard';
  }
}

function handlePreviewResult(result) {
  if (!result || !result.ok) {
    showReconcileMessage(describePreviewError(result));
    return;
  }

  const { preview } = result;

  if (!preview.removalCandidates.length) {
    showReconcileMessage('Dashboard is up to date.');
    return;
  }

  const count = preview.removalCandidates.length;
  showRemovalConfirmation(
    `Sync will remove ${count} dashboard ${count === 1 ? 'entry' : 'entries'} that ${count === 1 ? 'is' : 'are'} no longer saved in the extension.`,
    preview.removalCandidates,
  );
}

// Maps a preview/approval failure result to a user-facing message.
// Shared by both calls since they return the same ok/reason shape.
function describePreviewError(result) {
  if (!result) return 'Sync failed.';

  switch (result.reason) {
    case 'not-configured':
      return 'Save a connection first.';
    case 'unauthorized':
      return '✗ Token invalid or revoked - generate a new one from the dashboard.';
    case 'network-error':
      return '✗ Could not reach the dashboard - check the URL and your network connection.';
    case 'invalid-url':
      return '✗ Dashboard URL is not valid.';
    case 'invalid-response':
      return '✗ Dashboard returned an unexpected response.';
    case 'no-candidates':
      return 'Nothing to remove.';
    default:
      return `✗ Sync failed${result.status ? ` (HTTP ${result.status})` : ''}.`;
  }
}

// Shows a plain informational message (no pending removal) - used for
// "up to date", errors, and post-approval results alike.
function showReconcileMessage(message) {
  pendingRemovalCandidates = null;
  const resultDiv = document.getElementById('reconcileResult');
  const messageEl = document.getElementById('reconcileMessage');
  const listEl = document.getElementById('reconcileCandidateList');
  const actionsEl = document.getElementById('reconcileActions');

  messageEl.textContent = message;
  listEl.style.display = 'none';
  listEl.innerHTML = '';
  actionsEl.style.display = 'none';
  resultDiv.style.display = 'block';
}

// Shows the count message, a compact title/company list, and the
// Cancel/Approve controls, and stores the exact candidates so
// approveRemovals() can send them back unmodified.
function showRemovalConfirmation(message, candidates) {
  pendingRemovalCandidates = candidates;

  const resultDiv = document.getElementById('reconcileResult');
  const messageEl = document.getElementById('reconcileMessage');
  const listEl = document.getElementById('reconcileCandidateList');
  const actionsEl = document.getElementById('reconcileActions');

  messageEl.textContent = message;

  listEl.innerHTML = '';
  for (const candidate of candidates) {
    const li = document.createElement('li');
    const title = candidate.title || 'Untitled';
    const company = candidate.company || 'Unknown company';
    li.textContent = `${title} - ${company}`;
    listEl.appendChild(li);
  }
  listEl.style.display = candidates.length ? 'block' : 'none';

  actionsEl.style.display = 'flex';
  resultDiv.style.display = 'block';
}

function hideReconcileResult() {
  pendingRemovalCandidates = null;
  document.getElementById('reconcileResult').style.display = 'none';
  document.getElementById('reconcileCandidateList').innerHTML = '';
}

function cancelRemovalConfirmation() {
  // Cancel means no removal request is ever sent - this only clears
  // local UI state.
  hideReconcileResult();
}

async function approveRemovals() {
  if (!pendingRemovalCandidates || !pendingRemovalCandidates.length) return;

  // Capture before any state gets cleared by an intermediate message.
  const candidates = pendingRemovalCandidates;

  const approveBtn = document.getElementById('reconcileApproveBtn');
  const cancelBtn = document.getElementById('reconcileCancelBtn');
  approveBtn.disabled = true;
  cancelBtn.disabled = true;
  approveBtn.textContent = 'Removing...';

  try {
    // Send exactly the removalCandidates array the preview returned -
    // never reconstructed client-side.
    const result = await sendMessagePromise({
      action: 'approveReconciliationRemovals',
      removalCandidates: candidates,
    });
    handleApprovalResult(result);
  } catch (error) {
    showReconcileMessage('Could not complete the removal right now. Nothing was changed.');
  } finally {
    approveBtn.disabled = false;
    cancelBtn.disabled = false;
    approveBtn.textContent = 'Approve removal';
  }
}

function handleApprovalResult(result) {
  if (!result || !result.ok) {
    showReconcileMessage(describePreviewError(result));
    return;
  }

  const deleted = result.deletedCount || 0;
  const skipped = (result.skippedIds || []).length;

  let message = `✓ Removed ${deleted} dashboard ${deleted === 1 ? 'entry' : 'entries'}.`;
  if (skipped) {
    message += ` ${skipped} ${skipped === 1 ? 'entry was' : 'entries were'} skipped because they changed since the preview.`;
  }

  showReconcileMessage(message);
}

// ============================================
// SYNC FILTERS TO DASHBOARD
//
// Sends the current filter settings (normalized/mapped via
// filter-sync.js's FilterSync, run in the background service worker -
// see background.js's 'syncFilterSettings' handler) to job-saver-web's
// Discover import. Purely a one-way push of a read-only copy: never
// mutates filterSettings, savedJobs, or LinkedIn filtering behavior -
// this page's own filter form/local storage are untouched by a sync
// either way.
// ============================================

async function runFilterSync() {
  const syncBtn = document.getElementById('syncFiltersBtn');
  syncBtn.disabled = true;
  syncBtn.textContent = '🧭 Syncing...';
  hideFilterSyncResult();

  try {
    const result = await sendMessagePromise({ action: 'syncFilterSettings' });
    handleFilterSyncResult(result);
  } catch (error) {
    showFilterSyncMessage('Could not sync filters right now.');
  } finally {
    syncBtn.disabled = false;
    syncBtn.textContent = '🧭 Sync Filters to Dashboard';
  }
}

function handleFilterSyncResult(result) {
  if (!result || !result.ok) {
    showFilterSyncMessage(describePreviewError(result));
    return;
  }

  const synced = (result.summary && result.summary.synced) || [];
  const unsupported = (result.summary && result.summary.unsupported) || [];

  let message;
  if (synced.length === 0 && unsupported.length === 0) {
    message = 'Synced - no filters were configured to send.';
  } else {
    message = `✓ ${synced.length} filter${synced.length === 1 ? '' : 's'} synced.`;
    if (unsupported.length > 0) {
      message += ` ${unsupported.length} LinkedIn-only setting${unsupported.length === 1 ? '' : 's'} weren't imported.`;
    }
  }

  showFilterSyncMessage(message, unsupported);
}

// Shows the sync result message, and (only when there is at least one)
// the plain list of unsupported setting names - so a user who wants to
// know exactly what didn't transfer can see it without extra UI.
function showFilterSyncMessage(message, unsupportedNames) {
  const resultDiv = document.getElementById('filterSyncResult');
  const messageEl = document.getElementById('filterSyncMessage');
  const listEl = document.getElementById('filterSyncUnsupportedList');

  messageEl.textContent = message;

  listEl.innerHTML = '';
  if (unsupportedNames && unsupportedNames.length > 0) {
    for (const name of unsupportedNames) {
      const li = document.createElement('li');
      li.textContent = name;
      listEl.appendChild(li);
    }
    listEl.style.display = 'block';
  } else {
    listEl.style.display = 'none';
  }

  resultDiv.style.display = 'block';
}

function hideFilterSyncResult() {
  document.getElementById('filterSyncResult').style.display = 'none';
  document.getElementById('filterSyncUnsupportedList').innerHTML = '';
}
