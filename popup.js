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
    const result = await chrome.storage.local.get(['savedJobs']);
    const savedJobs = result.savedJobs || {};

    // Keep the real storage key paired with each job all the way
    // through to rendering, so delete always targets the actual
    // persisted key instead of a recomputed one.
    const jobEntries = Object.entries(savedJobs).sort((a, b) => {
      return new Date(b[1].dateSaved) - new Date(a[1].dateSaved);
    });

    const count = jobEntries.length;
    document.getElementById('jobCount').textContent =
      `${count} job${count !== 1 ? 's' : ''} saved`;

    displayJobs(jobEntries);

  } catch (error) {
    console.error('Error loading jobs:', error);
    showError('Failed to load saved jobs');
  }
}

function displayJobs(jobEntries) {
  const container = document.getElementById('jobsContainer');

  if (jobEntries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div>No jobs saved yet</div>
        <div style="font-size: 12px; margin-top: 8px;">
          Visit LinkedIn and click "Save Job"
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = jobEntries.map(([key, job]) => createJobCard(key, job)).join('');

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const key = e.target.dataset.key;
      deleteJob(key);
    });
  });
}

function createJobCard(dedupeKey, job) {
  const date = new Date(job.dateSaved).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Get source badge color. Built In and Himalayas are kept here (though
  // neither is an actively supported site anymore) purely so any
  // historical jobs a user already saved from either keep their badge
  // color instead of falling back to the generic gray.
  const sourceColors = {
    'LinkedIn': '#0a66c2',
    'Built In': '#00A4BD',
    'Himalayas': '#6366F1'
  };
  const sourceColor = sourceColors[job.source] || '#666';

  // job.url may have arrived via CSV import (untrusted file content),
  // and historical records saved before this check existed could
  // already contain anything. Never turn an unsafe/invalid value into
  // an actionable link - render the title as plain text instead.
  const titleHtml = window.UrlUtils.isSafeJobUrl(job.url)
    ? `<a href="${escapeHtml(job.url)}" target="_blank" class="job-title">${escapeHtml(job.title || 'Untitled Job')}</a>`
    : `<span class="job-title" title="No valid link available for this job">${escapeHtml(job.title || 'Untitled Job')}</span>`;

  return `
    <div class="job-card">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
        ${titleHtml}
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

    // Quote-aware across the whole file, so a quoted field containing
    // an embedded newline stays part of its logical row instead of
    // being torn apart before parsing even starts. Rows that are
    // entirely blank (e.g. a stray blank line in a hand-edited file)
    // are dropped here, same as the prior line-level filtering did -
    // but now only after real row boundaries are known.
    const rows = window.CsvUtils.parseCSV(text).filter(
      row => row.some(field => field.trim() !== '')
    );

    if (rows.length < 2) {
      alert('CSV file is empty or invalid');
      return;
    }

    // rows[0] is the header row (Title, Company, Location, Source,
    // URL, Date Saved); columns are read positionally from row 1 on.
    const importedJobs = [];

    for (let i = 1; i < rows.length; i++) {
      const values = rows[i];

      if (values.length >= 6) {
        const job = {
          title: values[0] || '',
          company: values[1] || '',
          location: values[2] || '',
          source: values[3] || 'LinkedIn',
          url: values[4] || '',
          dateSaved: values[5] || new Date().toISOString()
        };

        // CSV content is untrusted (a file the user picked from disk,
        // not something this extension generated in this session).
        // Reject an unsafe/invalid URL scheme (e.g. "javascript:")
        // rather than trying to repair it - the job is still useful
        // without a link, so it is kept with an empty url instead of
        // dropping the whole imported row.
        if (!window.UrlUtils.isSafeJobUrl(job.url)) {
          job.url = '';
        }

        // Attach jobId (when derivable from the URL) so this imported
        // job carries the same shape as an organically-saved one, and
        // so future identity comparisons can use it.
        const jobId = extractJobIdFromURL(job.url);
        if (jobId) job.jobId = jobId;

        importedJobs.push(job);
      }
    }

    if (importedJobs.length === 0) {
      alert('No valid jobs found in CSV');
      return;
    }

    if (confirm(`Import ${importedJobs.length} job(s)? This will merge with existing jobs; jobs already saved will be skipped.`)) {
      const result = await chrome.storage.local.get(['savedJobs']);
      const savedJobs = result.savedJobs || {};

      let addedCount = 0;
      let skippedCount = 0;

      // Compare each imported job against ALL existing entries by
      // canonical identity (not by recomputing a key), so re-importing
      // a CSV exported from this extension's own saved jobs does not
      // create duplicate entries under a different key format.
      importedJobs.forEach(job => {
        const existingKey = window.JobIdentity.findExistingKey(savedJobs, job);
        if (existingKey) {
          skippedCount++;
          return;
        }
        const key = window.JobIdentity.storageKey(job);
        savedJobs[key] = job;
        addedCount++;
      });

      await chrome.storage.local.set({ savedJobs });
      await loadAndDisplayJobs();

      alert(
        `Imported ${addedCount} new job${addedCount !== 1 ? 's' : ''}.` +
        (skippedCount > 0 ? ` ${skippedCount} already saved, skipped.` : '')
      );
    }

  } catch (error) {
    console.error('Error importing CSV:', error);
    alert('Failed to import CSV: ' + error.message);
  }
  
  // Reset file input
  event.target.value = '';
}

function extractJobIdFromURL(url) {
  // LinkedIn
  let match = url.match(/\/jobs\/view\/(\d+)/);
  if (match) return match[1];
  
  match = url.match(/currentJobId=(\d+)/);
  if (match) return match[1];
  
  // Built In is no longer an actively supported site, but this branch
  // is kept so a CSV exported while Built In was supported can still be
  // re-imported and its jobId/duplicate detection work correctly.
  match = url.match(/\/job\/[^\/]+\/(\d+)/);
  if (match) return match[1];
  
  // Himalayas is no longer an actively supported site, but this branch
  // is kept so a CSV exported while Himalayas was supported can still
  // be re-imported and its jobId/duplicate detection work correctly.
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
