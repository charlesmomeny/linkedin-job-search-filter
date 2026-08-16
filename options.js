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

  // Set up event listeners
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('resetBtn').addEventListener('click', resetSettings);
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
