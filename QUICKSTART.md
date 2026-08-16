# Quick Start Guide

## Installation (5 minutes)

### 1. Create Extension Folder
Create a new folder called `multi-site-job-saver` and move all the downloaded files into it.

### 2. Create an Icon
You need a 48x48 pixel icon file named `icon.png`. You have two options:

**Option A - Use a placeholder:**
1. Go to https://via.placeholder.com/48/0a66c2/ffffff?text=JS
2. Right-click → Save image as → `icon.png`
3. Save in your extension folder

**Option B - Create a simple one:**
1. Open any image editor (Paint, Photoshop, GIMP, etc.)
2. Create a 48x48 pixel image
3. Add text "JS" or a simple design
4. Save as `icon.png`

### 3. Load Extension
1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked"
5. Select your `multi-site-job-saver` folder
6. Click "Select Folder"

✅ You should now see "Multi-Site Job Saver" in your extensions list!

## First Test (2 minutes)

### Test on LinkedIn (easiest to verify)
1. Go to https://www.linkedin.com/jobs/search/
2. Look for a floating panel on the right side that says "🎯 LinkedIn Filters"
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
- Make sure you're on the /jobs section of the site
- Check the browser console (F12) for error messages
- Verify the extension is enabled in chrome://extensions/

### "Save button doesn't extract job details"
- The site's HTML structure might be different than expected
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
- [ ] popup.html
- [ ] popup-updated.js
- [ ] options.html
- [ ] options.js
- [ ] background.js
- [ ] styles.css
- [ ] icon.png (you need to create this)

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
