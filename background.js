// Background service worker for LinkedIn Job Saver

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
  
  return true;
});