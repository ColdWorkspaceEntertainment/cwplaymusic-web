// Mobile menu open/close
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

// Highlight the nav link for the section currently in view
const sections = document.querySelectorAll('main [id]');
const navItems = document.querySelectorAll('.nav-links a[data-nav]');

const setActive = (id) => {
  navItems.forEach((link) => {
    link.classList.toggle('is-active', link.getAttribute('href') === `#${id}`);
  });
};

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        setActive(entry.target.id);
      }
    });
  },
  { rootMargin: '-40% 0px -55% 0px' }
);

sections.forEach((section) => observer.observe(section));
