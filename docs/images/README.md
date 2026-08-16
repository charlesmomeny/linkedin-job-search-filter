# Screenshots needed here

Two screenshots are referenced from the main [README](../../README.md) and
don't exist yet. Automated capture wasn't used for either: the search-panel
shot needs a real, logged-in LinkedIn session (personal data risk to
capture and commit from here), and the settings-page shot needs Chrome's
native "Load unpacked" file picker, which browser automation tools can't
drive. Both are quick to do by hand.

## 1. `linkedin-search-panel.png`

**What**: A LinkedIn job search results page (`linkedin.com/jobs/search/...`)
with the extension's floating panel visible on the right.

**How**:
1. Load the unpacked extension (see README → Installation)
2. Go to a LinkedIn job search results page
3. Optionally drag the panel somewhere that reads well in a screenshot
4. Crop or blur out anything personally identifying before saving:
   - Your name/photo in the top nav
   - The LinkedIn Chat/messaging sidebar if visible
   - Anything in the job results tied specifically to your account (not
     usually an issue - job listings themselves are public)
5. Save as `docs/images/linkedin-search-panel.png` (PNG, ~1200px wide is plenty)

## 2. `settings-page.png`

**What**: The extension's own settings page (`options.html`).

**How**:
1. With the extension loaded, click the extension icon → "⚙️ Filter Settings"
   (or right-click the extension icon → Options)
2. Optionally fill in a few example filter keywords so the page doesn't
   look empty
3. Screenshot the page
4. Save as `docs/images/settings-page.png`

No personal data risk here - this page is just the extension's own UI,
not LinkedIn content.

---

Once both files exist, the broken-image placeholders in the main README
will render normally - no README changes needed.
