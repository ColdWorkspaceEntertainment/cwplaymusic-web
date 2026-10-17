// =========================================================
//  CW PLAY — shared script for every page.
//  Product data (status, orders, reviews) lives in catalog.json.
//  Keep catalog.json in sync with Fizzy's catalog on Discord.
// =========================================================

// Site root, so pages inside folders can find catalog.json and the API
const ROOT = new URL('./', document.currentScript.src);

// Order endpoint on Güzel Hosting (PHP). The site itself stays on GitHub Pages.
const ORDER_API = 'https://medya.cwplaymusic.com/fizzy/order.php';

// "Log in with Discord": verifies the username so orders can't be sent under someone else's name.
const LOGIN_URL = 'https://medya.cwplaymusic.com/fizzy/login.php';
const LOGIN_KEY = 'cw_discord_login';

function decodePayload(token) {
  const p = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(p + '='.repeat((4 - (p.length % 4)) % 4)));
}

// The server sends the visitor back as  /#store&login=TOKEN . Keep the token for this tab only and clean the address bar.
(function captureLogin() {
  const m = window.location.hash.match(/[#&]login=([A-Za-z0-9_.-]+)/);
  if (!m) return;
  try {
    const d = decodePayload(m[1]);
    if (d && d.u && d.exp) {
      sessionStorage.setItem(LOGIN_KEY, JSON.stringify({ token: m[1], u: d.u, exp: d.exp }));
    }
  } catch (err) { /* invalid token: ignore */ }
  history.replaceState(null, '', window.location.pathname + window.location.search + '#store');
})();

function readLogin() {
  try {
    const d = JSON.parse(sessionStorage.getItem(LOGIN_KEY) || 'null');
    if (!d || !d.token) return null;
    if (d.exp * 1000 < Date.now()) { sessionStorage.removeItem(LOGIN_KEY); return null; }
    return d;
  } catch (err) {
    return null;
  }
}

const loginStyle = document.createElement('style');
loginStyle.textContent = '.login-row{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin-bottom:.9rem}.login-row small{opacity:.75}';
document.head.append(loginStyle);

const STATUS_LABELS = { open: 'Open', full: 'Full' };

const STATUS_NOTES = {
  'priority-listeners': {
    open: 'Spots are open. Order it in the store or from Fizzy\'s catalog on Discord.',
    full: 'The list is full for now. It reopens with the next preview round.',
  },
};

// ---------- Small DOM helper (textContent only, never innerHTML) ----------
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function icon(classes) {
  const i = el('i', classes);
  i.setAttribute('aria-hidden', 'true');
  return i;
}

// ---------- Catalog ----------
let CATALOG = [];

async function loadCatalog() {
  const res = await fetch(new URL('catalog.json', ROOT), { cache: 'no-store' });
  if (!res.ok) throw new Error('catalog');
  const data = await res.json();
  return Array.isArray(data.products) ? data.products : [];
}

function applyStatuses(products) {
  const byKey = Object.fromEntries(products.map((p) => [p.key, p]));

  document.querySelectorAll('[data-status-for]').forEach((node) => {
    const product = byKey[node.dataset.statusFor];
    if (!product || !STATUS_LABELS[product.status]) return;
    node.textContent = STATUS_LABELS[product.status];
    node.classList.remove('status--open', 'status--full');
    node.classList.add(`status--${product.status}`);
  });

  document.querySelectorAll('[data-status-note]').forEach((node) => {
    const key = node.dataset.statusNote;
    const product = byKey[key];
    const note = product && STATUS_NOTES[key] && STATUS_NOTES[key][product.status];
    if (note) node.textContent = note;
  });
}

function ratingText(p) {
  if (!p.reviews || p.rating == null) return 'No reviews yet';
  return `${Number(p.rating).toFixed(1)} (${p.reviews} ${p.reviews === 1 ? 'review' : 'reviews'})`;
}

function renderCatalog(products) {
  const box = document.getElementById('catalog');
  if (!box) return;
  box.replaceChildren();

  if (!products.length) {
    box.append(el('p', 'catalog-empty', 'The catalog is empty right now. Check back soon.'));
    return;
  }

  products.forEach((p) => {
    const card = el('article', `product-card${p.featured ? ' product-card--featured' : ''}`);

    const head = el('h4', 'product-head', p.id != null ? `#${p.id} — ${p.name}` : p.name);
    card.append(head);

    if (p.description) card.append(el('p', 'product-desc', p.description));

    if (Array.isArray(p.rules) && p.rules.length) {
      const ul = el('ul', 'product-rules');
      p.rules.forEach((r) => ul.append(el('li', null, r)));
      card.append(ul);
    }

    if (p.price) {
      const price = el('p', 'product-price');
      price.append(icon('fa-solid fa-tag'), document.createTextNode(` ${p.price}`));
      card.append(price);
    }

    const meta = el('div', 'product-meta');
    if (STATUS_LABELS[p.status]) {
      meta.append(el('span', `status status--${p.status}`, STATUS_LABELS[p.status]));
    }
    const rating = el('span', 'meta-item');
    rating.append(icon('fa-solid fa-star'), document.createTextNode(` ${ratingText(p)}`));
    const orders = el('span', 'meta-item');
    const n = Number(p.orders) || 0;
    orders.append(icon('fa-solid fa-box'), document.createTextNode(` ${n} ${n === 1 ? 'order' : 'orders'}`));
    meta.append(rating, orders);
    card.append(meta);

    const actions = el('div', 'product-actions');
    const orderBtn = el('button', 'btn btn-primary', p.status === 'full' ? 'Full' : 'Order');
    orderBtn.type = 'button';
    if (p.status !== 'open') {
      orderBtn.disabled = true;
      orderBtn.setAttribute('aria-label', `${p.name} is full`);
    } else {
      orderBtn.addEventListener('click', () => openOrderDialog(p, 'order'));
    }
    const commentBtn = el('button', 'btn btn-ghost', 'Comment');
    commentBtn.type = 'button';
    commentBtn.addEventListener('click', () => openOrderDialog(p, 'comment'));
    actions.append(orderBtn, commentBtn);

    if (p.page) {
      const more = el('a', 'product-more', 'Details');
      more.href = new URL(p.page, ROOT).href;
      actions.append(more);
    }
    card.append(actions);

    box.append(card);
  });
}

// ---------- Order / comment dialog ----------
const dialog = document.getElementById('orderDialog');
const form = document.getElementById('orderForm');
let current = null; // { product, type, openedAt }

let loginRow = null;

function renderLoginRow() {
  if (!form) return;
  if (!loginRow) {
    loginRow = el('div', 'login-row');
    form.querySelector('label.field').before(loginRow);
  }
  loginRow.replaceChildren();
  const login = readLogin();
  if (login) {
    loginRow.append(el('span', 'login-who', `Signed in as ${login.u}`));
    const out = el('button', 'btn btn-ghost', 'Log out');
    out.type = 'button';
    out.addEventListener('click', () => {
      sessionStorage.removeItem(LOGIN_KEY);
      renderLoginRow();
      applyLoginToField();
    });
    loginRow.append(out);
  } else {
    const inBtn = el('a', 'btn btn-ghost', 'Log in with Discord');
    inBtn.href = LOGIN_URL;
    loginRow.append(inBtn, el('small', null, 'Optional. Verifies your username.'));
  }
}

function applyLoginToField() {
  const login = readLogin();
  if (login) {
    form.username.value = login.u;
    form.username.readOnly = true;
  } else {
    form.username.readOnly = false;
  }
}

function setError(text) {
  document.getElementById('orderError').textContent = text || '';
}

function openOrderDialog(product, type) {
  if (!dialog) return;
  current = { product, type, openedAt: Date.now() };
  form.reset();
  setError('');
  renderLoginRow();
  applyLoginToField();
  form.querySelector('.order-body').hidden = false;
  form.querySelector('.order-done').hidden = true;

  const isComment = type === 'comment';
  document.getElementById('orderTitle').textContent = isComment ? 'Leave a comment' : 'Place an order';
  document.getElementById('orderProduct').textContent =
    product.id != null ? `#${product.id} — ${product.name}` : product.name;
  document.getElementById('messageLabel').textContent = isComment ? 'Comment' : 'Note (optional)';
  form.message.required = isComment;
  document.getElementById('orderSubmit').textContent = isComment ? 'Send comment' : 'Send order';

  dialog.showModal();
  form.username.focus();
}

if (dialog && form) {
  dialog.querySelectorAll('[data-close]').forEach((b) =>
    b.addEventListener('click', () => dialog.close()));

  // Click on the dark backdrop closes the dialog
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!current) return;
    setError('');

    const username = form.username.value.trim().toLowerCase();
    const message = form.message.value.trim();

    if (!/^[a-z0-9_.]{2,32}$/.test(username)) {
      setError('Enter your Discord username: 2–32 characters, letters, numbers, dots or underscores.');
      form.username.focus();
      return;
    }
    if (current.type === 'comment' && message.length < 2) {
      setError('Write your comment before sending.');
      form.message.focus();
      return;
    }
    if (!form.agree.checked) {
      setError('Accept the Terms of Use and Privacy Policy to continue.');
      return;
    }

    const submit = document.getElementById('orderSubmit');
    const label = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'Sending…';

    try {
      const res = await fetch(ORDER_API, {
        method: 'POST',
        // text/plain = "simple request": no OPTIONS pre-check, which IIS can block
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({
          type: current.type,
          product: current.product.key,
          username,
          message,
          website: form.website.value, // honeypot
          token: (readLogin() || {}).token || '', // Discord login (optional)
          elapsed: Date.now() - current.openedAt, // ms since the form was opened (bots fill it instantly)
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (data.login) { // login expired or required
          sessionStorage.removeItem(LOGIN_KEY);
          renderLoginRow();
          applyLoginToField();
        }
        setError(data.error || 'Your order couldn\'t be sent. Try again in a few minutes.');
        return;
      }
      document.getElementById('orderDoneText').textContent = current.type === 'comment'
        ? 'Your comment reached us on Discord. Thank you.'
        : 'Your order reached us on Discord. We\'ll reply to you there.';
      form.querySelector('.order-body').hidden = true;
      form.querySelector('.order-done').hidden = false;
    } catch (err) {
      console.error('Order request failed:', err);
      setError('Couldn\'t connect. Check your connection and try again.');
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  });
}

// ---------- Start ----------
loadCatalog()
  .then((products) => {
    CATALOG = products;
    applyStatuses(products);
    renderCatalog(products);
  })
  .catch(() => {
    const box = document.getElementById('catalog');
    if (box) {
      box.replaceChildren(el('p', 'catalog-empty',
        'The catalog couldn\'t be loaded. Refresh the page, or find it in Fizzy\'s catalog on Discord.'));
    }
  });

// ---------- Mobile menu open/close ----------
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

if (navToggle && navLinks) {
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
}

// ---------- Tabs (index.html only): one section visible at a time ----------
const panels = Array.from(document.querySelectorAll('main .tab-panel'));

if (panels.length) {
  const DEFAULT_TAB = 'welcome';
  const SITE_TITLE = 'CW PLAY — Cold Works Production';
  const panelIds = panels.map((panel) => panel.id);
  const navItems = document.querySelectorAll('.nav-links a[data-nav]');

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

  // Load the Spotify player only when its tab is first opened
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

    if (moveFocus) {
      const heading = panel.querySelector('h1, h2');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }
  }

  function tabFromHash() {
    return decodeURIComponent(window.location.hash.slice(1)).split('&')[0] || DEFAULT_TAB;
  }

  window.addEventListener('hashchange', () => showTab(tabFromHash(), true));
  showTab(tabFromHash());
}
