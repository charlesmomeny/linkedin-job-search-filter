// Background service worker for LinkedIn Job Saver

// url-utils.js is a dependency of dashboard-sync.js (URL safety
// checking) and must be loaded first.
importScripts('url-utils.js', 'dashboard-sync.js');

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openOptions') {
    // Open the options page
    chrome.runtime.openOptionsPage();
    sendResponse({ success: true });
  }

  if (request.action === 'openPopup') {
    // Open popup.html in a new tab
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup.html')
    });
    sendResponse({ success: true });
  }

  if (request.action === 'syncJobToDashboard') {
    // Centralized here (rather than in content-universal.js) so the
    // one place that knows how to talk to the dashboard is also the
    // one place with cross-origin fetch permission for it. A missing/
    // unconfigured connection resolves ok:false without ever calling
    // fetch - see dashboard-sync.js.
    (async () => {
      const stored = await chrome.storage.local.get(['dashboardConnection']);
      const result = await self.DashboardSync.syncJob(
        stored.dashboardConnection,
        request.jobData,
      );

      // Surfaced in the options page as "last sync" status. Never
      // stores anything from `result` that could leak the token -
      // result only ever contains ok/reason/status.
      if (stored.dashboardConnection) {
        await chrome.storage.local.set({
          dashboardConnection: {
            ...stored.dashboardConnection,
            lastSyncAt: new Date().toISOString(),
            lastSyncOk: result.ok,
          },
        });
      }

      sendResponse(result);
    })();
    return true; // keep the message channel open for the async response
  }

  if (request.action === 'testDashboardConnection') {
    // Settings' "Test Connection" control. Separate stored fields
    // (lastTestAt/lastTestOk) from the job-sync ones above - a manual
    // connection test and a real job sync are different events and
    // shouldn't be conflated in the status shown to the user.
    (async () => {
      const stored = await chrome.storage.local.get(['dashboardConnection']);
      const result = await self.DashboardSync.testConnection(stored.dashboardConnection);

      if (stored.dashboardConnection) {
        await chrome.storage.local.set({
          dashboardConnection: {
            ...stored.dashboardConnection,
            lastTestAt: new Date().toISOString(),
            lastTestOk: result.ok,
          },
        });
      }

      sendResponse(result);
    })();
    return true;
  }

  if (request.action === 'syncDashboard') {
    // Settings' "Sync Dashboard" control (step 1 of manual
    // reconciliation - see options.js). Pushes every currently-saved
    // job first (best-effort, same syncJob() used for the automatic
    // per-save sync - a suppressed job just resolves ok:true with no
    // job created, never a warning), so the preview that follows
    // compares against up-to-date dashboard state, then returns a
    // read-only preview. Never deletes anything itself - see
    // DashboardSync.requestReconciliationPreview()'s own comment.
    (async () => {
      const stored = await chrome.storage.local.get(['dashboardConnection', 'savedJobs']);
      const connection = stored.dashboardConnection;
      const savedJobs = stored.savedJobs || {};

      for (const job of Object.values(savedJobs)) {
        await self.DashboardSync.syncJob(connection, job);
      }

      const identities = self.DashboardSync.buildReconciliationIdentities(savedJobs);
      const preview = await self.DashboardSync.requestReconciliationPreview(connection, identities);

      sendResponse(preview);
    })();
    return true;
  }

  if (request.action === 'approveReconciliationRemovals') {
    // Settings' explicit "Approve removal" control - only ever called
    // with the exact removalCandidates array a prior 'syncDashboard'
    // preview returned (see options.js). Never reconstructs candidates
    // here - request.removalCandidates is passed straight through to
    // DashboardSync.approveReconciliationRemovals(), which itself only
    // sends {id, updatedAt} for each.
    (async () => {
      const stored = await chrome.storage.local.get(['dashboardConnection']);
      const result = await self.DashboardSync.approveReconciliationRemovals(
        stored.dashboardConnection,
        request.removalCandidates,
      );

      sendResponse(result);
    })();
    return true;
  }

  return true;
});