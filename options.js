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

// Default profile data
const defaultProfile = {
  enableAutofill: false,
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  city: '',
  state: '',
  zipCode: '',
  linkedinUrl: '',
  websiteUrl: '',
  yearsExperience: '',
  workAuthorization: '',
  veteranStatus: '',
  disabilityStatus: '',
  gender: '',
  race: ''
};

// Load saved settings when page opens
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  
  // Set up event listeners
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('resetBtn').addEventListener('click', resetSettings);
  document.getElementById('addCustomMappingBtn').addEventListener('click', addCustomMapping);
});

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['filterSettings', 'profileData', 'fieldMappings', 'unknownFields']);
    const settings = result.filterSettings || defaultSettings;
    const profile = result.profileData || defaultProfile;
    const fieldMappings = result.fieldMappings || {};
    const unknownFields = result.unknownFields || [];
    
    console.log('Loading settings:', settings);
    
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
    
    console.log('Settings loaded successfully');
    
    // Populate profile form fields
    document.getElementById('enableAutofill').checked = profile.enableAutofill;
    document.getElementById('firstName').value = profile.firstName;
    document.getElementById('lastName').value = profile.lastName;
    document.getElementById('email').value = profile.email;
    document.getElementById('phone').value = profile.phone;
    document.getElementById('city').value = profile.city;
    document.getElementById('state').value = profile.state;
    document.getElementById('zipCode').value = profile.zipCode;
    document.getElementById('linkedinUrl').value = profile.linkedinUrl;
    document.getElementById('websiteUrl').value = profile.websiteUrl;
    document.getElementById('yearsExperience').value = profile.yearsExperience;
    document.getElementById('workAuthorization').value = profile.workAuthorization;
    document.getElementById('veteranStatus').value = profile.veteranStatus;
    document.getElementById('disabilityStatus').value = profile.disabilityStatus;
    document.getElementById('gender').value = profile.gender;
    document.getElementById('race').value = profile.race;
    
    // Display field mappings
    displayFieldMappings(fieldMappings, unknownFields);
    
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Failed to load settings', 'error');
  }
}

async function saveSettings() {
  try {
    console.log('Saving settings...');
    
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
    
    console.log('Settings to save:', settings);
    
    // Get profile values from form
    const profile = {
      enableAutofill: document.getElementById('enableAutofill').checked,
      firstName: document.getElementById('firstName').value.trim(),
      lastName: document.getElementById('lastName').value.trim(),
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      city: document.getElementById('city').value.trim(),
      state: document.getElementById('state').value.trim(),
      zipCode: document.getElementById('zipCode').value.trim(),
      linkedinUrl: document.getElementById('linkedinUrl').value.trim(),
      websiteUrl: document.getElementById('websiteUrl').value.trim(),
      yearsExperience: document.getElementById('yearsExperience').value.trim(),
      workAuthorization: document.getElementById('workAuthorization').value,
      veteranStatus: document.getElementById('veteranStatus').value,
      disabilityStatus: document.getElementById('disabilityStatus').value,
      gender: document.getElementById('gender').value,
      race: document.getElementById('race').value
    };
    
    // Save to storage
    await chrome.storage.local.set({ 
      filterSettings: settings,
      profileData: profile
    });
    
    console.log('Settings saved successfully!');
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

function displayFieldMappings(fieldMappings, unknownFields) {
  const container = document.getElementById('fieldMappingsContainer');
  
  // Combine saved mappings with unknown fields
  const allFields = new Set([...Object.keys(fieldMappings), ...unknownFields]);
  
  if (allFields.size === 0) {
    container.innerHTML = `
      <div style="color: #666; font-style: italic; padding: 20px; text-align: center;">
        No field mappings yet. Start applying to jobs and the extension will learn!
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';
  
  allFields.forEach(fieldLabel => {
    const mappingDiv = createFieldMappingElement(fieldLabel, fieldMappings[fieldLabel] || '');
    container.appendChild(mappingDiv);
  });
}

function createFieldMappingElement(fieldLabel, currentMapping) {
  const div = document.createElement('div');
  div.className = 'field-mapping';
  div.dataset.fieldLabel = fieldLabel;
  
  const header = document.createElement('div');
  header.className = 'field-mapping-header';
  
  const question = document.createElement('div');
  question.className = 'field-question';
  question.textContent = fieldLabel;
  
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-mapping-btn';
  deleteBtn.textContent = '🗑️ Delete';
  deleteBtn.addEventListener('click', () => deleteFieldMapping(fieldLabel));
  
  header.appendChild(question);
  header.appendChild(deleteBtn);
  
  const controls = document.createElement('div');
  controls.className = 'field-mapping-controls';
  
  // Dropdown to select profile field or custom
  const select = document.createElement('select');
  select.innerHTML = `
    <option value="">-- Custom Answer --</option>
    <option value="firstName">First Name</option>
    <option value="lastName">Last Name</option>
    <option value="email">Email</option>
    <option value="phone">Phone</option>
    <option value="city">City</option>
    <option value="state">State</option>
    <option value="zipCode">Zip Code</option>
    <option value="linkedinUrl">LinkedIn URL</option>
    <option value="websiteUrl">Website URL</option>
    <option value="yearsExperience">Years of Experience</option>
    <option value="workAuthorization">Work Authorization</option>
    <option value="veteranStatus">Veteran Status</option>
    <option value="disabilityStatus">Disability Status</option>
    <option value="gender">Gender</option>
    <option value="race">Race/Ethnicity</option>
  `;
  
  // Custom text input
  const customInput = document.createElement('input');
  customInput.type = 'text';
  customInput.placeholder = 'Enter custom answer...';
  customInput.style.display = 'none';
  
  // Set current mapping
  if (currentMapping && currentMapping.startsWith('profile:')) {
    const profileKey = currentMapping.replace('profile:', '');
    select.value = profileKey;
  } else if (currentMapping) {
    select.value = '';
    customInput.value = currentMapping;
    customInput.style.display = 'block';
  }
  
  // Show/hide custom input based on selection
  select.addEventListener('change', () => {
    if (select.value === '') {
      customInput.style.display = 'block';
      customInput.focus();
    } else {
      customInput.style.display = 'none';
      customInput.value = '';
    }
    saveFieldMappings();
  });
  
  customInput.addEventListener('change', saveFieldMappings);
  
  controls.appendChild(select);
  controls.appendChild(customInput);
  
  div.appendChild(header);
  div.appendChild(controls);
  
  return div;
}

async function saveFieldMappings() {
  try {
    const mappingElements = document.querySelectorAll('.field-mapping');
    const fieldMappings = {};
    
    mappingElements.forEach(el => {
      const fieldLabel = el.dataset.fieldLabel;
      const select = el.querySelector('select');
      const customInput = el.querySelector('input');
      
      if (select.value) {
        // Use profile field
        fieldMappings[fieldLabel] = `profile:${select.value}`;
      } else if (customInput.value.trim()) {
        // Use custom text
        fieldMappings[fieldLabel] = customInput.value.trim();
      }
    });
    
    await chrome.storage.local.set({ fieldMappings });
    console.log('Field mappings saved:', fieldMappings);
    
  } catch (error) {
    console.error('Error saving field mappings:', error);
  }
}

async function deleteFieldMapping(fieldLabel) {
  if (!confirm(`Delete mapping for "${fieldLabel}"?`)) return;
  
  try {
    const result = await chrome.storage.local.get(['fieldMappings', 'unknownFields']);
    const fieldMappings = result.fieldMappings || {};
    const unknownFields = result.unknownFields || [];
    
    // Remove from mappings
    delete fieldMappings[fieldLabel];
    
    // Remove from unknown fields
    const updatedUnknownFields = unknownFields.filter(f => f !== fieldLabel);
    
    await chrome.storage.local.set({ 
      fieldMappings,
      unknownFields: updatedUnknownFields
    });
    
    // Reload display
    displayFieldMappings(fieldMappings, updatedUnknownFields);
    
  } catch (error) {
    console.error('Error deleting field mapping:', error);
  }
}

function addCustomMapping() {
  const fieldLabel = prompt('Enter the field question/label:');
  if (!fieldLabel || !fieldLabel.trim()) return;
  
  chrome.storage.local.get(['fieldMappings', 'unknownFields'], (result) => {
    const fieldMappings = result.fieldMappings || {};
    const unknownFields = result.unknownFields || [];
    
    // Add to unknown fields if not already there
    if (!unknownFields.includes(fieldLabel) && !fieldMappings[fieldLabel]) {
      unknownFields.push(fieldLabel);
    }
    
    chrome.storage.local.set({ unknownFields }, () => {
      loadSettings(); // Reload to show new field
    });
  });
}