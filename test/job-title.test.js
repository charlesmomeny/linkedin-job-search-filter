// Regression tests for job-title.js - finding the job title on a
// LinkedIn job-detail page without capturing navigation headings such
// as the hidden "1 notification" / "0 notifications total" heading in
// LinkedIn's global nav (the real bug: site-adapters.js used to take
// the first <h1>/<h2> on the page).
//
// Plain Node, built-in test runner only (no package manager, no
// third-party framework). Run with: node --test test/*.test.js

const { test } = require('node:test');
const assert = require('node:assert/strict');
const JobTitle = require('../job-title.js');

// ---------------------------------------------------------------------
// Minimal fake DOM: just enough of querySelector/querySelectorAll/
// closest/parentElement/textContent for job-title.js, supporting the
// selector shapes it uses (tag, .class, #id, [attr="value"], descendant
// combinator, comma lists).
// ---------------------------------------------------------------------

function el(tag, props = {}, children = []) {
  const node = {
    tagName: tag.toUpperCase(),
    classList: props.class ? props.class.split(/\s+/) : [],
    id: props.id || '',
    attrs: props.attrs || {},
    ownText: props.text || '',
    children,
    parentElement: null,
    title: props.title || '',
    get nextElementSibling() {
      if (!this.parentElement) return null;
      const siblings = this.parentElement.children;
      return siblings[siblings.indexOf(this) + 1] || null;
    },
    get textContent() {
      return this.ownText + this.children.map((child) => child.textContent).join('');
    },
    querySelectorAll(selectorList) {
      const out = [];
      const walk = (parent) => {
        for (const child of parent.children) {
          if (matchesList(child, selectorList)) out.push(child);
          walk(child);
        }
      };
      walk(this);
      return out;
    },
    querySelector(selectorList) {
      return this.querySelectorAll(selectorList)[0] || null;
    },
    closest(selectorList) {
      for (let current = this; current; current = current.parentElement) {
        if (matchesList(current, selectorList)) return current;
      }
      return null;
    }
  };
  for (const child of children) child.parentElement = node;
  return node;
}

function matchesCompound(node, compound) {
  if (compound === '*') return true;
  const parts = compound.match(/^[a-z0-9]+|\.[\w-]+|#[\w-]+|\[[^\]]+\]/gi) || [];
  return parts.every((part) => {
    if (part.startsWith('.')) return node.classList.includes(part.slice(1));
    if (part.startsWith('#')) return node.id === part.slice(1);
    if (part.startsWith('[')) {
      const [, name, value] = part.match(/^\[([\w-]+)="([^"]*)"\]$/);
      return node.attrs[name] === value;
    }
    return node.tagName === part.toUpperCase();
  });
}

function matchesComplex(node, selector) {
  const compounds = selector.trim().split(/\s+/);
  if (!matchesCompound(node, compounds[compounds.length - 1])) return false;
  let ancestor = node.parentElement;
  for (let i = compounds.length - 2; i >= 0; i--) {
    while (ancestor && !matchesCompound(ancestor, compounds[i])) ancestor = ancestor.parentElement;
    if (!ancestor) return false;
    ancestor = ancestor.parentElement;
  }
  return true;
}

function matchesList(node, selectorList) {
  return selectorList.split(',').some((selector) => matchesComplex(node, selector));
}

// Representative of LinkedIn's current standalone /jobs/view/<id>
// page: global nav (with its visually hidden notification-count
// heading) BEFORE the job's top card, and no stable class names on the
// top card itself.
function linkedInJobPage({ navHeading = '1 notification', jobTitle = 'Senior Software Engineer', topCardClass } = {}) {
  const companyLink = el('a', { attrs: { href: 'https://www.linkedin.com/company/acme/life/' }, text: 'Acme' });
  const titleHeading = el('h1', { class: 't-24 t-bold inline' }, jobTitle ? [el('a', { text: jobTitle })] : []);
  const doc = el('html', {}, [
    el('header', { id: 'global-nav', class: 'global-nav' }, [
      el('nav', { attrs: { role: 'navigation' } }, [
        el('h1', { class: 'visually-hidden', text: navHeading })
      ])
    ]),
    el('main', {}, [
      el('div', { class: topCardClass || 'a1b2c3' }, [
        el('div', { class: 'd4e5f6' }, [el('div', { class: 'g7h8' }, [companyLink])]),
        el('div', { class: 'i9j0' }, [titleHeading]),
        el('div', { class: 'k1l2', text: 'Seattle, WA · 3 days ago · 42 applicants' })
      ]),
      el('div', {}, [el('h2', { text: 'About the job' })])
    ])
  ]);
  return { doc, companyLink, titleHeading };
}

// ---------------------------------------------------------------------
// isPlaceholderTitle
// ---------------------------------------------------------------------

test('isPlaceholderTitle: flags notification/message counters', () => {
  for (const title of ['1 notification', '0 notifications total', '12 new notifications', '(3) notifications', '99+ notifications', '2 unread messages', 'Notifications', '  1\n notification ']) {
    assert.equal(JobTitle.isPlaceholderTitle(title), true, title);
  }
});

test('isPlaceholderTitle: keeps real titles that mention notifications/messages', () => {
  for (const title of ['Senior Software Engineer', 'Notifications Platform Engineer', 'Engineer, Push Notifications', 'Messaging Engineer', '10x Engineer']) {
    assert.equal(JobTitle.isPlaceholderTitle(title), false, title);
  }
});

// ---------------------------------------------------------------------
// titleFromDocumentTitle
// ---------------------------------------------------------------------

test('titleFromDocumentTitle: reads "<title> | <company> | LinkedIn" when the company matches', () => {
  assert.equal(
    JobTitle.titleFromDocumentTitle('Software Engineer - AI Trainer | DataAnnotation | LinkedIn', 'DataAnnotation'),
    'Software Engineer - AI Trainer'
  );
  assert.equal(JobTitle.titleFromDocumentTitle('(3) Data Engineer | Acme | LinkedIn', ' acme '), 'Data Engineer');
});

test('titleFromDocumentTitle: rejects search pages, mismatched companies, and placeholders', () => {
  assert.equal(JobTitle.titleFromDocumentTitle('(1) software engineer Jobs | LinkedIn', 'Acme'), null);
  assert.equal(JobTitle.titleFromDocumentTitle('Data Engineer | Globex | LinkedIn', 'Acme'), null);
  assert.equal(JobTitle.titleFromDocumentTitle('Data Engineer | Acme | Indeed', 'Acme'), null);
  assert.equal(JobTitle.titleFromDocumentTitle('1 notification | Acme | LinkedIn', 'Acme'), null);
  assert.equal(JobTitle.titleFromDocumentTitle('Data Engineer | Acme | LinkedIn', ''), null);
});

// ---------------------------------------------------------------------
// findTitle
// ---------------------------------------------------------------------

// Mirrors LinkedIn's CURRENT /jobs/view/<id> markup, confirmed live
// (Oct 2026): no <h1> anywhere; an <h2> "0 notifications" first in the
// document; the title is a plain hashed-class <div> right after the
// company-name block; an unrelated <h2> section heading nearby.
function currentLinkedInJobPage({ title = 'Software Engineer - AI Trainer | DataAnnotation | LinkedIn' } = {}) {
  const companyLink = el('a', { attrs: { href: 'https://www.linkedin.com/company/dataannotation/life/' }, text: 'DataAnnotation' });
  const titleDiv = el('div', { class: 'fmbanj fmbg8a' }, [el('div', { class: 'fmbanb fmblit', text: 'Software Engineer - AI Trainer' })]);
  const doc = el('html', { title }, [
    el('div', { class: 'artdeco-toasts' }, [el('h2', { class: 'fmbarb fmblit', text: '0 notifications' })]),
    el('main', {}, [
      el('div', {}, [
        el('div', {}, [
          el('div', {}, [
            el('div', {}, [el('div', {}, [companyLink]), el('button', {})]),
            titleDiv,
            el('div', {}),
            el('p', { text: 'Iowa, United States · 1 month ago · 37 people clicked apply' }),
            el('div', { text: 'Promoted by hirer · Responses managed off LinkedIn' })
          ]),
          el('div', { text: 'RemoteFull-time' })
        ])
      ]),
      el('div', {}, [el('h2', { text: 'Use AI to assess how you fit' }), el('h2', { text: 'About the job' })])
    ])
  ]);
  return { doc, companyLink, titleDiv };
}

test('findTitle: current LinkedIn layout - uses the page title and locates the title element (never "0 notifications")', () => {
  const { doc, companyLink, titleDiv } = currentLinkedInJobPage();
  // Sanity check: the old first-<h1>-then-<h2> logic really was wrong here.
  assert.equal(doc.querySelector('h1'), null);
  assert.equal(doc.querySelector('h2').textContent, '0 notifications');

  const result = JobTitle.findTitle(doc, companyLink);
  assert.equal(result.text, 'Software Engineer - AI Trainer');
  assert.equal(result.element, titleDiv.children[0]);
});

test('findTitle: current layout without a usable page title - takes the element after the company block', () => {
  const { doc, companyLink, titleDiv } = currentLinkedInJobPage({ title: '(1) software engineer Jobs | LinkedIn' });
  const result = JobTitle.findTitle(doc, companyLink);
  assert.equal(result.text, 'Software Engineer - AI Trainer');
  assert.equal(result.element, titleDiv);
});

test('findTitle: never takes a nearby <h2> section heading or the location line', () => {
  const companyLink = el('a', { attrs: { href: '/company/acme/' }, text: 'Acme' });
  const doc = el('html', {}, [
    el('main', {}, [
      el('div', {}, [
        el('div', {}, [companyLink]),
        el('p', { text: 'Seattle, WA · 2 days ago' }),
        el('h2', { text: 'About the job' })
      ])
    ])
  ]);
  assert.deepEqual(JobTitle.findTitle(doc, companyLink), { text: '', element: null });
});

// Older logged-in layout: a real <h1> title, with LinkedIn's hidden
// notification-count heading earlier in the nav.
function olderLinkedInJobPage({ navHeading = '1 notification' } = {}) {
  const companyLink = el('a', { attrs: { href: 'https://www.linkedin.com/company/acme/life/' }, text: 'Acme' });
  const titleHeading = el('h1', { class: 't-24 t-bold inline' }, [el('a', { text: 'Senior Software Engineer' })]);
  const doc = el('html', {}, [
    el('header', { id: 'global-nav', class: 'global-nav' }, [
      el('nav', { attrs: { role: 'navigation' } }, [el('h1', { class: 'visually-hidden', text: navHeading })])
    ]),
    el('main', {}, [
      el('div', { class: 'a1b2c3' }, [
        el('div', { class: 'd4e5f6' }, [el('div', { class: 'g7h8' }, [companyLink])]),
        el('div', { class: 'i9j0' }, [titleHeading]),
        el('div', { class: 'k1l2', text: 'Seattle, WA · 3 days ago · 42 applicants' })
      ]),
      el('div', {}, [el('h2', { text: 'About the job' })])
    ])
  ]);
  return { doc, companyLink, titleHeading };
}

test('findTitle: older layout - skips the nav notification heading that precedes the job <h1>', () => {
  const { doc, companyLink, titleHeading } = olderLinkedInJobPage();
  assert.equal(doc.querySelector('h1').textContent, '1 notification');
  assert.deepEqual(JobTitle.findTitle(doc, companyLink), { text: 'Senior Software Engineer', element: titleHeading });
});

test('findTitle: older layout with no company link - falls back to a non-nav, non-placeholder <h1>', () => {
  const { doc, titleHeading } = olderLinkedInJobPage({ navHeading: '0 notifications total' });
  assert.equal(JobTitle.findTitle(doc, null).element, titleHeading);
});

test('findTitle: rejects a placeholder <h1> even outside the nav', () => {
  const companyLink = el('a', { attrs: { href: '/company/acme/' }, text: 'Acme' });
  const realTitle = el('h1', { text: 'Data Engineer' });
  const doc = el('html', {}, [
    el('main', {}, [el('div', {}, [el('h1', { text: '1 notification' }), el('div', {}, [companyLink]), realTitle])])
  ]);
  assert.equal(JobTitle.findTitle(doc, companyLink).element, realTitle);
});

test('findTitle: prefers LinkedIn\'s known job-title container when present', () => {
  const titleHeading = el('h1', { text: 'Product Designer' });
  const doc = el('html', {}, [
    el('header', {}, [el('h1', { text: '5 notifications' })]),
    el('div', { class: 'job-details-jobs-unified-top-card__job-title' }, [titleHeading])
  ]);
  assert.equal(JobTitle.findTitle(doc, null).element, titleHeading);
});

test('findTitle: supports the guest/public top-card layout', () => {
  const titleHeading = el('h1', { class: 'top-card-layout__title', text: 'QA Lead' });
  const doc = el('html', {}, [el('main', {}, [titleHeading])]);
  assert.equal(JobTitle.findTitle(doc, null).text, 'QA Lead');
});

test('findTitle: split search view - picks the detail pane title, not a list card or section heading', () => {
  const companyLink = el('a', { attrs: { href: '/company/globex/' }, text: 'Globex' });
  const detailTitle = el('div', { text: 'Backend Engineer' });
  const doc = el('html', { title: '(1) data engineer Jobs | LinkedIn' }, [
    el('div', { class: 'artdeco-toasts' }, [el('h2', { text: '0 notifications total' })]),
    el('main', {}, [
      el('ul', { class: 'jobs-search-results' }, [
        el('li', {}, [el('div', { class: 'job-card-container' }, [el('strong', { text: 'Other Job One' })])]),
        el('li', {}, [el('div', { class: 'job-card-container' }, [el('strong', { text: 'Other Job Two' })])])
      ]),
      el('section', { class: 'jobs-search__job-details' }, [
        el('div', {}, [el('div', {}, [companyLink]), detailTitle, el('p', { text: 'Remote · 1 day ago' })]),
        el('h2', { text: 'About the job' })
      ])
    ])
  ]);
  assert.deepEqual(JobTitle.findTitle(doc, companyLink), { text: 'Backend Engineer', element: detailTitle });
});

test('findTitle: returns empty (never guesses) when only nav/placeholder headings exist', () => {
  const companyLink = el('a', { attrs: { href: '/company/acme/' }, text: 'Acme' });
  const doc = el('html', {}, [
    el('header', {}, [el('h1', { text: 'Messaging' })]),
    el('main', {}, [el('div', {}, [companyLink, el('h1', { text: '1 notification' })])])
  ]);
  assert.deepEqual(JobTitle.findTitle(doc, companyLink), { text: '', element: null });
});

// ---------------------------------------------------------------------
// repairedTitle - explicit-save repair of records saved before the fix
// ---------------------------------------------------------------------

test('repairedTitle: replaces a stored placeholder with a real extracted title', () => {
  assert.equal(JobTitle.repairedTitle('1 notification', '  Senior Software Engineer '), 'Senior Software Engineer');
});

test('repairedTitle: never touches a real stored title', () => {
  assert.equal(JobTitle.repairedTitle('Senior Software Engineer', 'Staff Engineer'), null);
});

test('repairedTitle: never replaces with an empty or placeholder title', () => {
  assert.equal(JobTitle.repairedTitle('1 notification', ''), null);
  assert.equal(JobTitle.repairedTitle('1 notification', '2 notifications'), null);
});
