// Popup logic for displaying and managing saved jobs

document.addEventListener('DOMContentLoaded', async () => {
  await loadAndDisplayJobs();
  
  document.getElementById('importBtn').addEventListener('click', importFromCSV);
  document.getElementById('exportBtn').addEventListener('click', exportToCSV);
  document.getElementById('clearBtn').addEventListener('click', clearAllJobs);
  
  // Handle file selection
  document.getElementById('csvFileInput').addEventListener('change', handleCSVFile);
});

async function loadAndDisplayJobs() {
  try {
    console.log('Loading saved jobs...');
    const result = await chrome.storage.local.get(['savedJobs']);
    const savedJobs = result.savedJobs || {};
    
    console.log('Saved jobs from storage:', savedJobs);
    console.log('Number of jobs:', Object.keys(savedJobs).length);
    
    const jobsArray = Object.values(savedJobs).sort((a, b) => {
      return new Date(b.dateSaved) - new Date(a.dateSaved);
    });
    
    const count = jobsArray.length;
    document.getElementById('jobCount').textContent = 
      `${count} job${count !== 1 ? 's' : ''} saved`;
    
    displayJobs(jobsArray);
    console.log('Jobs displayed successfully');
    
  } catch (error) {
    console.error('Error loading jobs:', error);
    showError('Failed to load saved jobs');
  }
}

function displayJobs(jobs) {
  const container = document.getElementById('jobsContainer');
  
  if (jobs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div>No jobs saved yet</div>
        <div style="font-size: 12px; margin-top: 8px;">
          Visit LinkedIn, Built In, or Himalayas and click "Save Job"
        </div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = jobs.map(job => createJobCard(job)).join('');
  
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const key = e.target.dataset.key;
      deleteJob(key);
    });
  });
}

function createJobCard(job) {
  const date = new Date(job.dateSaved).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const dedupeKey = generateDedupeKey(job);
  
  // Get source badge color
  const sourceColors = {
    'LinkedIn': '#0a66c2',
    'Built In': '#00A4BD',
    'Himalayas': '#6366F1'
  };
  const sourceColor = sourceColors[job.source] || '#666';
  
  return `
    <div class="job-card">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
        <a href="${escapeHtml(job.url)}" target="_blank" class="job-title">
          ${escapeHtml(job.title || 'Untitled Job')}
        </a>
        <span style="background: ${sourceColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; white-space: nowrap; margin-left: 8px;">
          ${escapeHtml(job.source || 'Unknown')}
        </span>
      </div>
      <div class="job-company">
        ${escapeHtml(job.company || 'Unknown Company')}
      </div>
      <div class="job-location">
        📍 ${escapeHtml(job.location || 'Location not specified')}
      </div>
      <div class="job-date">
        Saved: ${date}
      </div>
      <div class="job-actions">
        <button class="delete-btn" data-key="${escapeHtml(dedupeKey)}">
          🗑️ Delete
        </button>
      </div>
    </div>
  `;
}

function generateDedupeKey(jobData) {
  if (jobData.jobId) {
    return `jobid_${jobData.jobId}`;
  }
  
  const key = `${jobData.title}_${jobData.company}_${jobData.location}`
    .toLowerCase()
    .replace(/\s+/g, '_');
  return key;
}

async function deleteJob(dedupeKey) {
  if (!confirm('Delete this job?')) return;
  
  try {
    const result = await chrome.storage.local.get(['savedJobs']);
    const savedJobs = result.savedJobs || {};
    
    delete savedJobs[dedupeKey];
    
    await chrome.storage.local.set({ savedJobs });
    await loadAndDisplayJobs();
    
  } catch (error) {
    console.error('Error deleting job:', error);
    alert('Failed to delete job');
  }
}

async function clearAllJobs() {
  if (!confirm('Delete ALL saved jobs? This cannot be undone!')) return;
  
  try {
    await chrome.storage.local.set({ savedJobs: {} });
    await loadAndDisplayJobs();
  } catch (error) {
    console.error('Error clearing jobs:', error);
    alert('Failed to clear jobs');
  }
}

async function exportToCSV() {
  try {
    const result = await chrome.storage.local.get(['savedJobs']);
    const savedJobs = result.savedJobs || {};
    const jobsArray = Object.values(savedJobs);
    
    if (jobsArray.length === 0) {
      alert('No jobs to export');
      return;
    }
    
    // Create CSV content
    const headers = ['Title', 'Company', 'Location', 'Source', 'URL', 'Date Saved'];
    const rows = jobsArray.map(job => [
      job.title || '',
      job.company || '',
      job.location || '',
      job.source || 'LinkedIn',
      job.url || '',
      job.dateSaved || ''
    ]);
    
    // Convert to CSV format
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `multi-site-jobs-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('Error exporting CSV:', error);
    alert('Failed to export CSV');
  }
}

function importFromCSV() {
  // Trigger the hidden file input
  document.getElementById('csvFileInput').click();
}

async function handleCSVFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      alert('CSV file is empty or invalid');
      return;
    }
    
    // Parse CSV
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const jobs = {};
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      
      if (values.length >= 6) {
        const job = {
          title: values[0] || '',
          company: values[1] || '',
          location: values[2] || '',
          source: values[3] || 'LinkedIn',
          url: values[4] || '',
          dateSaved: values[5] || new Date().toISOString()
        };
        
        // Extract job ID from URL or create dedupe key
        const jobId = extractJobIdFromURL(job.url);
        const dedupeKey = jobId ? `jobid_${jobId}` : generateDedupeKey(job);
        
        jobs[dedupeKey] = job;
      }
    }
    
    const count = Object.keys(jobs).length;
    if (count === 0) {
      alert('No valid jobs found in CSV');
      return;
    }
    
    if (confirm(`Import ${count} jobs? This will merge with existing jobs.`)) {
      // Merge with existing jobs
      const result = await chrome.storage.local.get(['savedJobs']);
      const existingJobs = result.savedJobs || {};
      const mergedJobs = { ...existingJobs, ...jobs };
      
      await chrome.storage.local.set({ savedJobs: mergedJobs });
      await loadAndDisplayJobs();
      
      alert(`Successfully imported ${count} jobs!`);
    }
    
  } catch (error) {
    console.error('Error importing CSV:', error);
    alert('Failed to import CSV: ' + error.message);
  }
  
  // Reset file input
  event.target.value = '';
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current); // Add last value
  return values;
}

function extractJobIdFromURL(url) {
  // LinkedIn
  let match = url.match(/\/jobs\/view\/(\d+)/);
  if (match) return match[1];
  
  match = url.match(/currentJobId=(\d+)/);
  if (match) return match[1];
  
  // Built In
  match = url.match(/\/job\/[^\/]+\/(\d+)/);
  if (match) return match[1];
  
  // Himalayas - use full path as ID
  if (url.includes('himalayas.app')) {
    match = url.match(/\/jobs\/([^\/]+\/[^\/\?#]+)/);
    if (match) return match[1].replace(/\//g, '_');
  }
  
  return null;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  const container = document.getElementById('jobsContainer');
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <div>${escapeHtml(message)}</div>
    </div>
  `;
}
