// Site-specific adapters for LinkedIn
// This file contains the logic to detect and interact with the site

const SiteAdapters = {
  // Detect current site
  getCurrentSite() {
    const hostname = window.location.hostname;
    if (hostname.includes('linkedin.com')) return 'linkedin';
    return null;
  },

  // Get the appropriate adapter for current site
  getAdapter() {
    const site = this.getCurrentSite();
    return this[site] || null;
  },

  // LinkedIn adapter
  linkedin: {
    name: 'LinkedIn',
    color: '#0a66c2',

    isSearchResultsPage() {
      return window.location.href.includes('/jobs/search/') || 
             window.location.href.includes('/jobs/search-results/') ||
             window.location.href.includes('/jobs/collections/');
    },

    isJobDetailsPage() {
      return window.location.href.includes('/jobs/view/') && 
             !window.location.href.includes('/jobs/search');
    },

    getJobCards() {
      // Try multiple selectors for different LinkedIn layouts
      let cards = document.querySelectorAll('div[data-view-name="job-search-job-card"]');
      
      if (cards.length === 0) {
        cards = document.querySelectorAll('div.job-card-list__entity-lockup');
      }
      
      // New search results layout (left sidebar)
      if (cards.length === 0) {
        cards = document.querySelectorAll('li.jobs-search-results__list-item');
      }
      
      // Alternative: scaffold layout
      if (cards.length === 0) {
        cards = document.querySelectorAll('div.scaffold-layout__list-item');
      }
      
      // Fallback: any element with job data
      if (cards.length === 0) {
        cards = document.querySelectorAll('[data-job-id]');
      }
      
      // NEW: For obfuscated class names (2025+ LinkedIn redesign)
      // Find the job list container by looking for job content
      if (cards.length === 0) {
        // Look for any paragraph/heading with typical job titles or company names
        const jobTexts = Array.from(document.querySelectorAll('p, h3, h2, span')).filter(el => {
          const text = el.textContent.trim();
          // Look for text that's likely a company name or job title
          return text.length > 5 && text.length < 100 && 
                 /[A-Z]/.test(text) && 
                 (text.includes('Manager') || text.includes('Engineer') || 
                  text.includes('Developer') || text.includes('Analyst') ||
                  text.includes('Director') || text.includes('Specialist') ||
                  text.includes('Lead') || text.includes('Senior'));
        });
        
        if (jobTexts.length > 0) {
          // Walk up from the first job text to find a container with many children
          let current = jobTexts[0];
          for (let i = 0; i < 15; i++) {
            current = current.parentElement;
            if (!current) break;
            
            const childCount = current.children.length;
            // Look for a container with 10-200 children (likely the job list)
            if (childCount >= 10 && childCount <= 200) {
              // Verify this is actually job cards by checking if children have job-like text
              const children = Array.from(current.children);
              const hasJobContent = children.slice(0, 5).some(child => {
                const text = child.textContent;
                return text.length > 50 && 
                       (text.includes('Manager') || text.includes('Engineer') || 
                        text.includes('Developer') || text.includes('Posted') ||
                        text.includes('Remote') || text.includes('ago'));
              });
              
              if (hasJobContent) {
                // Filter out empty/promoted cards
                cards = children.filter(child => child.textContent.trim().length > 50);
                console.log('Job Saver: Found', cards.length, 'job cards using container method');
                break;
              }
            }
          }
        }
      }
      
      console.log('Job Saver: LinkedIn getJobCards found', cards.length, 'cards');
      return Array.from(cards);
    },

    extractJobDataFromCard(card) {
      const cardText = card.textContent.toLowerCase();
      const textParts = cardText.split('\n').map(s => s.trim()).filter(s => s.length > 0);

      return {
        title: textParts.length > 0 ? textParts[0] : '',
        company: textParts.length > 1 ? textParts[1] : '',
        location: '',
        fullText: cardText,
        // LinkedIn shows "Reposted" and "posted X ago" as plain visible
        // text on the card - the same text this adapter already scrapes
        // for salary/keyword matching - rather than a stable selector,
        // since none is reliable given LinkedIn's changing markup.
        // isReposted is a plain boolean; postedDaysAgo is a number of
        // days or null when the age couldn't be determined from the
        // card text (never guessed as 0).
        isReposted: window.JobFreshness.isReposted(cardText),
        postedDaysAgo: window.JobFreshness.parsePostedDaysAgo(cardText)
      };
    },

    extractJobData() {
      const data = {
        url: window.location.href,
        jobId: this.extractJobId(window.location.href),
        title: '',
        company: '',
        location: '',
        source: 'LinkedIn',
        dateSaved: new Date().toISOString()
      };

      // Extract title
      const titleElement = document.querySelector('h1') || 
                          document.querySelector('h2') ||
                          document.querySelector('[class*="job-title"]') ||
                          document.querySelector('[class*="jobs-unified-top-card__job-title"]');
      if (titleElement) {
        data.title = titleElement.textContent.trim();
      }

      // Extract company
      let companyElement = document.querySelector('a[href*="/company/"]');
      if (companyElement) {
        data.company = companyElement.textContent.trim();
      }

      if (!data.company) {
        companyElement = document.querySelector('[class*="job-details-jobs-unified-top-card__company-name"]') ||
                        document.querySelector('[class*="jobs-unified-top-card__company-name"]') ||
                        document.querySelector('[class*="job-card-container__company-name"]');
        if (companyElement) {
          data.company = companyElement.textContent.trim();
        }
      }

      // Extract location
      const locationElement = document.querySelector('[class*="location"]') ||
                            document.querySelector('[class*="workplace"]') ||
                            document.querySelector('[class*="job-details-jobs-unified-top-card__workplace-type"]');
      if (locationElement) {
        data.location = locationElement.textContent.trim();
      }

      return data;
    },

    extractJobId(url) {
      let match = url.match(/\/jobs\/view\/(\d+)/);
      if (match) return match[1];
      
      match = url.match(/currentJobId=(\d+)/);
      if (match) return match[1];
      
      return null;
    },

    hasEasyApply() {
      return true; // LinkedIn has Easy Apply
    }
  }
};

// Export for use in content script
window.SiteAdapters = SiteAdapters;
