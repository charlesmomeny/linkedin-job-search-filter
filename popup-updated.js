// Popup logic for displaying and managing saved jobs from multiple sources

document.addEventListener('DOMContentLoaded', async () => {
  await loadAndDisplayJobs();
  
  document.getElementById('exportBtn').addEventListener('click', exportToCSV);
  document.getElementById('clearBtn').addEventListener('click', clearAllJobs);
});

async function loadAndDisplayJobs() {
  try {
    const result = await chrome.storage.local.get(['savedJobs']);
    const savedJobs = result.savedJobs || {};
    
    const jobsArray = Object.values(savedJobs).sort((a, b) => {
      return new Date(b.dateSaved) - new Date(a.dateSaved);
    });
    
    const count = jobsArray.length;
    document.getElementById('jobCount').textContent = 
      `${count} job${count !== 1 ? 's' : ''} saved`;
    
    displayJobs(jobsArray);
    
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
    return `${jobData.source}_${jobData.jobId}`;
  }
  
  const key = `${jobData.source}_${jobData.title}_${jobData.company}_${jobData.location}`
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
    
    const headers = ['Source', 'Title', 'Company', 'Location', 'URL', 'Date Saved'];
    const rows = jobsArray.map(job => [
      job.source || 'Unknown',
      job.title || '',
      job.company || '',
      job.location || '',
      job.url || '',
      job.dateSaved || ''
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
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
