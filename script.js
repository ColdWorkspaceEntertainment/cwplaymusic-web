// ---------- Mobile menu open/close ----------
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
const navIcon = navToggle.querySelector('i');

function setMenuState(isOpen) {
  navLinks.classList.toggle('open', isOpen);
  navToggle.setAttribute('aria-expanded', String(isOpen));
  navToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  navIcon.classList.toggle('fa-bars', !isOpen);
  navIcon.classList.toggle('fa-xmark', isOpen);
}

navToggle.addEventListener('click', () => {
  setMenuState(!navLinks.classList.contains('open'));
});

navLinks.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => setMenuState(false));
});

// ---------- Tabs: only one section visible at a time ----------
const DEFAULT_TAB = 'welcome';
const SITE_TITLE = 'CW PLAY — Cold Works Production';

const panels = Array.from(document.querySelectorAll('main .tab-panel'));
const panelIds = panels.map((panel) => panel.id);
const navItems = document.querySelectorAll('.nav-links a[data-nav]');

// Highlight the nav link of the open tab
function setActiveNav(id) {
  navItems.forEach((link) => {
    const isActive = link.getAttribute('href') === `#${id}`;
    link.classList.toggle('is-active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

// Load YouTube/Spotify players only when their tab is first opened
function loadEmbeds(panel) {
  panel.querySelectorAll('iframe[data-src]').forEach((frame) => {
    frame.src = frame.dataset.src;
    frame.removeAttribute('data-src');
  });
}

function showTab(id, moveFocus = false) {
  if (!panelIds.includes(id)) id = DEFAULT_TAB;

  panels.forEach((panel) => {
    panel.hidden = panel.id !== id;
  });

  const panel = document.getElementById(id);
  loadEmbeds(panel);
  setActiveNav(id);

  document.title = id === DEFAULT_TAB
    ? SITE_TITLE
    : `${panel.dataset.title} — CW PLAY`;

  window.scrollTo({ top: 0, behavior: 'instant' });

  // Keyboard / screen reader users land on the new tab's heading
  if (moveFocus) {
    const heading = panel.querySelector('h1, h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }
}

function tabFromHash() {
  return decodeURIComponent(window.location.hash.slice(1)) || DEFAULT_TAB;
}

// Links like href="#channels" change the hash; back/forward buttons work too
window.addEventListener('hashchange', () => showTab(tabFromHash(), true));

showTab(tabFromHash());
