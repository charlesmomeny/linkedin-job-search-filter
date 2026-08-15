# Selector Customization Guide

## How to Find and Update Selectors

If the extension isn't working on Built In or Himalayas, you'll need to inspect the HTML and update the selectors. Here's how:

## Step 1: Inspect the Page

1. **Go to the job site** (e.g., builtin.com/jobs)
2. **Right-click** on a job card → "Inspect"
3. **Find the container element** that wraps the job card
4. **Note the class name or data attribute**

## Step 2: Identify Key Elements

Look for these elements and note their selectors:

### On Search Results Pages:
- **Job Card Container**: The main div/article that contains each job
- **Job Title**: Usually an `<h2>`, `<h3>`, or `<a>` tag
- **Company Name**: Often has class like "company", "employer", etc.
- **Location**: Usually has class like "location", "city", etc.

### On Job Detail Pages:
- **Job Title**: Usually an `<h1>` or large heading
- **Company Name**: Link or text with company name
- **Location**: Text or badge showing location/remote status

## Step 3: Update the Adapter

Open `site-adapters.js` and find the adapter (e.g., `builtin:` or `himalayas:`)

### Example: Updating Built In

Let's say you inspect builtin.com and find:
- Job cards have class: `job-listing-item`
- Titles are in: `<h3 class="job-title">`
- Companies are in: `<span class="company-name">`

Update the adapter:

```javascript
builtin: {
  // ... other code ...
  
  getJobCards() {
    // OLD:
    // return Array.from(document.querySelectorAll('[class*="job-item"]'));
    
    // NEW:
    return Array.from(document.querySelectorAll('.job-listing-item'));
  },

  extractJobDataFromCard(card) {
    // Update selectors here
    const titleElement = card.querySelector('.job-title'); // Updated!
    const title = titleElement ? titleElement.textContent.trim() : '';
    
    const companyElement = card.querySelector('.company-name'); // Updated!
    const company = companyElement ? companyElement.textContent.trim() : '';
    
    const locationElement = card.querySelector('[class*="location"]');
    const location = locationElement ? locationElement.textContent.trim() : '';

    return { title, company, location, fullText: card.textContent.toLowerCase() };
  },

  extractJobData() {
    const data = {
      url: window.location.href,
      jobId: this.extractJobId(window.location.href),
      title: '',
      company: '',
      location: '',
      source: 'Built In',
      dateSaved: new Date().toISOString()
    };

    // Update selectors for detail page
    const titleElement = document.querySelector('h1.job-title'); // Updated!
    if (titleElement) {
      data.title = titleElement.textContent.trim();
    }

    const companyElement = document.querySelector('.company-name'); // Updated!
    if (companyElement) {
      data.company = companyElement.textContent.trim();
    }

    const locationElement = document.querySelector('[class*="location"]');
    if (locationElement) {
      data.location = locationElement.textContent.trim();
    }

    return data;
  }
}
```

## Quick Reference: CSS Selectors

### By Class Name
```javascript
document.querySelector('.job-card')           // Single element
document.querySelectorAll('.job-card')       // All matching elements
```

### By ID
```javascript
document.querySelector('#job-details')
```

### By Attribute
```javascript
document.querySelector('[data-job-id]')      // Has attribute
document.querySelector('[data-type="job"]')  // Specific value
```

### Partial Match (Contains)
```javascript
document.querySelector('[class*="job"]')     // Class contains "job"
document.querySelector('[id*="detail"]')     // ID contains "detail"
```

### Multiple Selectors (OR)
```javascript
document.querySelector('h1, h2, h3')         // First h1, h2, or h3
document.querySelector('.title, .heading')   // First .title or .heading
```

### Child Combinator
```javascript
document.querySelector('.card > .title')     // Direct child
document.querySelector('.card .title')       // Any descendant
```

## Testing Your Changes

After updating selectors:

1. **Save the file**
2. **Go to chrome://extensions/**
3. **Click the reload icon** on your extension
4. **Go to the job site** and test
5. **Check the console** (F12) for logs:
   - "Job Saver: Found X job cards" means it's working
   - "Job Saver: Found 0 job cards" means selectors need adjustment

## Common Patterns by Site

### Built In (builtin.com)
Typical structure:
```html
<div class="job-item">
  <h3 class="job-title">Software Engineer</h3>
  <div class="company">Company Name</div>
  <div class="location">San Francisco, CA</div>
</div>
```

### Himalayas (himalayas.app)
Typical structure:
```html
<article class="job-card">
  <h2 class="title">Product Manager</h2>
  <div class="company-name">Startup Inc</div>
  <div class="remote-tag">Remote</div>
</article>
```

## Debugging Tips

### 1. Test Selectors in Console

Before updating the code, test selectors in the browser console:

```javascript
// Test if selector works
document.querySelectorAll('.job-card').length  // Should return a number > 0

// Test extraction
const card = document.querySelector('.job-card');
const title = card.querySelector('.title').textContent;
console.log(title);  // Should show job title
```

### 2. Use Multiple Fallbacks

If the structure varies, use fallbacks:

```javascript
const titleElement = card.querySelector('.job-title') || 
                    card.querySelector('h2') ||
                    card.querySelector('h3');
```

### 3. Log What You Find

Add console.log to see what's being extracted:

```javascript
extractJobData() {
  const data = { /* ... */ };
  
  const titleElement = document.querySelector('h1');
  console.log('Title element:', titleElement);
  console.log('Title text:', titleElement?.textContent);
  
  // ... rest of code
}
```

## Example: Complete Adapter Update

Here's a full example of updating the Built In adapter after inspecting the site:

```javascript
builtin: {
  name: 'Built In',
  color: '#00A4BD',

  isSearchResultsPage() {
    return window.location.pathname.includes('/jobs');
  },

  isJobDetailsPage() {
    return window.location.pathname.match(/\/job\/\d+/);
  },

  getJobCards() {
    // After inspecting, we found job cards have this structure
    const cards = document.querySelectorAll('article.job-listing');
    return Array.from(cards);
  },

  extractJobDataFromCard(card) {
    // Get the anchor tag with job title
    const link = card.querySelector('a.job-link');
    const title = link ? link.textContent.trim() : '';
    
    // Company is in a specific div
    const companyDiv = card.querySelector('div.company-info');
    const company = companyDiv ? companyDiv.textContent.trim() : '';
    
    // Location in a span
    const locationSpan = card.querySelector('span.job-location');
    const location = locationSpan ? locationSpan.textContent.trim() : '';

    return {
      title,
      company,
      location,
      fullText: card.textContent.toLowerCase()
    };
  },

  extractJobData() {
    const data = {
      url: window.location.href,
      jobId: this.extractJobId(window.location.href),
      title: '',
      company: '',
      location: '',
      source: 'Built In',
      dateSaved: new Date().toISOString()
    };

    // Main title is in h1 with specific class
    const titleElement = document.querySelector('h1.job-detail-title');
    if (titleElement) {
      data.title = titleElement.textContent.trim();
    }

    // Company name is a link
    const companyLink = document.querySelector('a.company-link');
    if (companyLink) {
      data.company = companyLink.textContent.trim();
    }

    // Location info
    const locationDiv = document.querySelector('div.job-location-info');
    if (locationDiv) {
      data.location = locationDiv.textContent.trim();
    }

    return data;
  },

  extractJobId(url) {
    // URL pattern: /job/123456
    const match = url.match(/\/job\/(\d+)/);
    return match ? match[1] : null;
  },

  hasEasyApply() {
    return false;
  }
}
```

## When Selectors Change

Job sites update their HTML frequently. If the extension stops working:

1. **Inspect the page again** - structure may have changed
2. **Update selectors** as described above
3. **Test thoroughly**
4. **Document your changes** for future reference

## Need Help?

If you're stuck:
1. Share the HTML structure you're seeing
2. Share the current selector that's not working
3. Share any console error messages
