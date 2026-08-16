# Multi-Site Job Saver Extension

## Overview

This Chrome extension allows you to save, filter, and manage job listings from LinkedIn.

## Features

✅ **Save Jobs**: Save jobs from LinkedIn with one click
✅ **Filter Search Results**: Hide jobs that don't match your criteria
✅ **Export to CSV**: Download all your saved jobs as a spreadsheet
✅ **Duplicate Detection**: Get notified when you try to save similar jobs
✅ **Easy Apply Autofill** (LinkedIn only): Automatically fill application forms

## Installation

1. **Download the extension files** to a folder on your computer

2. **Open Chrome Extensions**:
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)

3. **Load the extension**:
   - Click "Load unpacked"
   - Select the folder containing the extension files

4. **Verify installation**:
   - You should see "Multi-Site Job Saver" in your extensions list
   - The extension icon should appear in your Chrome toolbar

## File Structure

```
multi-site-job-saver/
├── manifest.json              # Extension configuration
├── site-adapters.js          # Site-specific logic for each platform
├── content-universal.js      # Main content script
├── popup.html                # Saved jobs viewer
├── popup-updated.js          # Popup logic (renamed from popup.js)
├── options.html              # Settings page
├── options.js                # Settings logic
├── background.js             # Background service worker
├── styles.css                # Button styles
└── icon.png                  # Extension icon (you'll need to create this)
```

## Setup Instructions

### Step 1: Update File References

In `popup.html`, change:
```html
<script src="popup.js"></script>
```
to:
```html
<script src="popup-updated.js"></script>
```

### Step 2: Create an Icon

Create a 48x48 pixel icon and save it as `icon.png` in the extension folder. You can use any image editor or generate one online.

### Step 3: Test on Each Site

#### Testing on LinkedIn
1. Visit https://www.linkedin.com/jobs/search/
2. You should see a "🎯 LinkedIn Filters" panel on the right side
3. Open a job listing
4. Click the "💾 Save Job" button
5. Check that the job appears in the extension popup

## Important Notes

### Site Adapter May Need Adjustment

LinkedIn's HTML structure changes frequently, so the adapter's selectors are best-effort and may occasionally need updating. If the extension doesn't work correctly, you may need to:

1. **Inspect the HTML** of the job pages using Chrome DevTools (F12)
2. **Update the selectors** in `site-adapters.js` for the specific site
3. **Look for**:
   - Job card elements in search results
   - Job title, company, and location elements
   - Unique class names or data attributes

### Common Issues & Solutions

**Problem**: Filter panel doesn't appear
- **Solution**: Check the browser console (F12) for errors
- The site might use a different URL structure

**Problem**: Job details aren't extracted correctly
- **Solution**: Update the selectors in the appropriate adapter in `site-adapters.js`
- Look for elements with class names like "job-title", "company-name", "location"

**Problem**: Jobs aren't appearing in search results
- **Solution**: The adapter's `getJobCards()` method needs to target the correct elements
- Inspect the page and find the container elements for job listings

### Customizing the Selectors

To customize LinkedIn's selectors:

1. Open `site-adapters.js`
2. Find the `linkedin:` adapter
3. Update these methods:
   - `getJobCards()`: Returns array of job card elements
   - `extractJobData()`: Extracts title, company, location from detail page
   - `extractJobDataFromCard()`: Extracts data from search result cards

Example:
```javascript
getJobCards() {
  // Update this selector to match the actual HTML structure
  return Array.from(document.querySelectorAll('.actual-job-card-class'));
}
```

## How to Use

### Saving Jobs

1. **Browse jobs** on LinkedIn
2. **Click "💾 Save Job"** on any job detail page
3. **View saved jobs** by clicking the extension icon

### Filtering Jobs

1. **Click the extension icon** to open settings
2. **Add keywords** to exclude or require in job titles
3. **Add locations** to filter or highlight
4. **Go to a job search page** and see filtered results

### Managing Saved Jobs

1. **Click the extension icon** to view all saved jobs
2. **Export to CSV** to download your job list
3. **Delete jobs** individually or clear all at once

## Testing Checklist

- [ ] Extension installs without errors
- [ ] Filter panel appears on LinkedIn job search
- [ ] Save button appears on LinkedIn job detail pages
- [ ] Jobs save successfully on LinkedIn
- [ ] Saved jobs appear in popup with correct source badges
- [ ] CSV export includes all jobs with source column
- [ ] Filters work on LinkedIn

## Troubleshooting

### Console Logging

The extension logs helpful information to the browser console. To view logs:

1. Open a job site
2. Press F12 to open DevTools
3. Go to the Console tab
4. Look for messages starting with "Job Saver:"

### Common Log Messages

- `Job Saver: Initializing for [Site Name]` - Extension is loading
- `Job Saver: Found X job cards` - Job filtering is working
- `Job Saver: Saved job:` - Job was saved successfully
- `Job Saver: Error...` - Something went wrong (check the error details)

### Debugging Tips

1. **Check the manifest**: Ensure all URLs are correct
2. **Verify permissions**: The extension needs access to all three sites
3. **Reload the extension**: After making changes, click the reload icon in chrome://extensions/
4. **Clear storage**: If things seem broken, clear the extension's storage:
   ```javascript
   // In browser console on any of the job sites:
   chrome.storage.local.clear()
   ```

## Advanced Configuration

### Adding More Job Sites

To add support for additional job sites:

1. **Add the domain** to `host_permissions` in `manifest.json`
2. **Add a new adapter** in `site-adapters.js`
3. **Implement required methods**:
   - `name`, `color`
   - `isSearchResultsPage()`
   - `isJobDetailsPage()`
   - `getJobCards()`
   - `extractJobData()`
   - `extractJobDataFromCard()`
   - `extractJobId()`

### Filter Settings

Configure filters in the extension options:
- **Exclude Keywords**: Hide jobs containing these words
- **Include Keywords**: Only show jobs with these words
- **Exclude Locations**: Hide jobs in certain locations
- **Include Locations**: Highlight jobs in preferred locations

## Support

If you encounter issues:

1. **Check the console** for error messages
2. **Verify site structure** hasn't changed (inspect HTML)
3. **Update selectors** in `site-adapters.js` as needed
4. **Test with simple cases** first (e.g., just saving one job)

## Future Enhancements

Possible improvements:
- Auto-detect more job sites
- Sync saved jobs across devices
- Integration with job tracking tools
- Advanced filtering (salary, remote/hybrid, etc.)
- Job application tracking

## License

This is a personal project. Modify and use as needed!
