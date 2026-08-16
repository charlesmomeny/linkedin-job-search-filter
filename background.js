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

  return true;
});