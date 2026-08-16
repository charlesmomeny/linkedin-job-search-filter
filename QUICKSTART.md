# Quick Start Guide

## Installation (5 minutes)

### 1. Get the extension files

Download the latest release ZIP from the
[Releases page](https://github.com/charlesmomeny/linkedin-job-search-filter/releases)
and unzip it - or clone the repository if you'd rather work from Git.
Either way you'll end up with a `linkedin-job-search-filter` folder
containing the extension files.

### 2. Load Extension
1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked"
5. Select your `linkedin-job-search-filter` folder
6. Click "Select Folder"

✅ You should now see "LinkedIn Job Search Filter" in your extensions list!

## First Test (2 minutes)

### Test on LinkedIn
1. Go to https://www.linkedin.com/jobs/search/
2. Look for a floating panel on the right side that says "🎯 LinkedIn Job Search Filter" - you can drag it by that header if it's in the way of anything
3. Open any job listing
4. Look for the "💾 Save Job" button (floating on right side)
5. Click it
6. Click the extension icon in your toolbar
7. You should see your saved job!

## Configure Filters (Optional)

1. Click the extension icon
2. Click "⚙️ Filter Settings"
3. Add keywords to filter out unwanted jobs
4. Save settings
5. Go back to LinkedIn job search
6. Jobs matching your filters will be hidden or dimmed

## Common Issues

### "Extension does not appear to work"
- Make sure you're on the /jobs section of LinkedIn
- Check the browser console (F12) for error messages
- Verify the extension is enabled in chrome://extensions/

### "Save button doesn't extract job details"
- LinkedIn's HTML structure might have changed
- See SELECTOR_GUIDE.md for how to update selectors
- Open browser console to see what's being extracted

### "Filter panel doesn't show"
- Make sure you're on a job search/results page
- Try refreshing the page
- Check if "Enable filters" is turned on in settings

## File Checklist

Make sure you have all these files in your extension folder:

Required files:
- [ ] manifest.json
- [ ] site-adapters.js
- [ ] content-universal.js
- [ ] panel-drag-utils.js
- [ ] job-identity.js
- [ ] keyword-matching.js
- [ ] lifecycle-utils.js
- [ ] job-freshness.js
- [ ] csv-utils.js
- [ ] url-utils.js
- [ ] popup.html
- [ ] popup.js
- [ ] options.html
- [ ] options.js
- [ ] background.js
- [ ] styles.css
- [ ] icons/ (icon-16.png, icon-32.png, icon-48.png, icon-128.png)

Documentation files (optional but helpful):
- [ ] README.md
- [ ] SELECTOR_GUIDE.md
- [ ] QUICKSTART.md (this file)

## Next Steps

1. ✅ Get it working on LinkedIn
2. ✅ Try saving a few jobs
3. ✅ Test the filters
4. ✅ Export to CSV to verify

If something doesn't work, that can happen since LinkedIn's HTML structure changes over time. Follow the SELECTOR_GUIDE.md to customize the selectors.

## Need More Help?

1. Check README.md for detailed information
2. Check SELECTOR_GUIDE.md for customization help
3. Look at browser console logs (F12 → Console tab)
4. Verify manifest.json permissions are correct

Good luck! 🚀
