// =========================================================
//  CW PLAY — shared script for every page.
//  Product data (status, orders, reviews) lives in catalog.json.
//  Keep catalog.json in sync with Fizzy's catalog on Discord.
// =========================================================

// Site root, so pages inside folders can find catalog.json and the API
const ROOT = new URL('./', document.currentScript.src);

// Order endpoint on Güzel Hosting (PHP). The site itself stays on GitHub Pages.
const ORDER_API = 'https://medya.cwplaymusic.com/fizzy/order.php';

// Login (Discord or a CW PLAY account): verifies who is ordering, so orders can't be sent under someone else's name.
const LOGIN_URL = 'https://medya.cwplaymusic.com/fizzy/login.php';
const CREDITS_API = 'https://medya.cwplaymusic.com/fizzy/credits.php';
const STATUS_API = 'https://medya.cwplaymusic.com/fizzy/status.php';
const SUPPORT_API = 'https://medya.cwplaymusic.com/fizzy/support.php';
const ACCOUNT_API = 'https://medya.cwplaymusic.com/fizzy/account.php';
const LOGIN_KEY = 'cw_discord_login';
const RETURN_KEY = 'cw_login_return'; // the product page to come back to after logging in

function decodePayload(token) {
  const p = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(p + '='.repeat((4 - (p.length % 4)) % 4)));
}

// The server sends the visitor back as  /#store&login=TOKEN . Keep the token for this tab only and clean the address bar.
/** Stores a login token (from Discord or a CW PLAY account). Returns false if it can't be read. */
function saveLogin(token) {
  try {
    const d = decodePayload(token);
    if (d && d.u && d.exp) {
      sessionStorage.setItem(LOGIN_KEY, JSON.stringify({ token, u: d.u, exp: d.exp }));
      return true;
    }
  } catch (err) { /* invalid token: ignore */ }
  return false;
}

/** Where to go after logging in: the page the visitor started from, if it's one of ours. */
function takeReturnPath() {
  const back = sessionStorage.getItem(RETURN_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  return back && back.startsWith('/') && !back.startsWith('//') && /(product|wallet|admin|status)\.html/.test(back) ? back : null;
}

/** Opens the login page (Discord or CW PLAY account) and remembers this page to come back to. */
function rememberReturn() {
  if (!/account\.html/.test(window.location.pathname)) {
    sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search);
  }
}

(function captureLogin() {
  const m = window.location.hash.match(/[#&]login=([A-Za-z0-9_.-]+)/);
  if (!m) return;
  saveLogin(m[1]);
  const back = takeReturnPath();
  if (back) {
    window.location.replace(back);
    return;
  }
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
  const products = Array.isArray(data.products) ? data.products : [];
  // Live order counts from the server are added to the numbers in catalog.json.
  // A small, uncached request just for the counts (waits at most 4 s, then shows the catalog numbers).
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`${STATUS_API}?orders=1&t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    const live = r.ok ? await r.json() : null;
    const counts = (live && live.orders) || {};
    const ratings = (live && live.ratings) || {};
    products.forEach((p) => {
      const n = Number(counts[p.key]) || 0;
      if (n) p.orders = (Number(p.orders) || 0) + n;
      // approved site reviews are added to the rating in catalog.json
      const r = ratings[p.key];
      if (r && r.count) {
        const baseN = p.rating != null ? Number(p.reviews) || 0 : 0;
        const total = baseN + r.count;
        p.rating = ((Number(p.rating) || 0) * baseN + r.sum) / total;
        p.reviews = total;
      }
    });
  } catch (err) { /* keep the catalog numbers */ }
  return products;
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

// ---------- CW Credits: shared helpers (also used by wallet.js and admin.js) ----------
function creditPrice(p) {
  const n = Number(p && p.credits);
  return Number.isInteger(n) && n > 0 ? n : 0;
}
function fmtCredits(n) {
  return Number(n || 0).toLocaleString('en-US');
}
function priceLabel(p) {
  const c = creditPrice(p);
  return c ? `${fmtCredits(c)} CW Credits${p.subscription ? ' / month' : ''}` : (p.price || 'Price on request');
}
async function creditsCall(action, extra = {}) {
  return apiCall(CREDITS_API, action, extra);
}

function supportCall(action, extra = {}) {
  return apiCall(SUPPORT_API, action, extra);
}

async function apiCall(url, action, extra = {}) {
  const login = readLogin();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ action, token: login ? login.token : '', ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.login) sessionStorage.removeItem(LOGIN_KEY); // login expired
    return { ok: res.ok && data.ok === true, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: 'Couldn\'t connect. Check your connection and try again.' } };
  }
}
function loginLink(label = 'Log in') {
  const a = el('a', 'shop-btn', label);
  a.href = new URL('account.html', ROOT).href;
  a.prepend(icon('fa-solid fa-right-to-bracket'));
  a.addEventListener('click', rememberReturn);
  return a;
}

// ---------- Status (status.html, the banner on every page, admin) ----------
const STATUS_CACHE_KEY = 'cw_status';
const STATUS_CACHE_MS = 2 * 60 * 1000;

/** Live status from the order server. Cached for 2 minutes per tab; null if it can't be reached. */
async function fetchStatus(force = false) {
  if (!force) {
    try {
      const c = JSON.parse(sessionStorage.getItem(STATUS_CACHE_KEY) || 'null');
      if (c && Date.now() - c.t < STATUS_CACHE_MS) return c.data;
    } catch (err) { /* ignore */ }
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(STATUS_API, { signal: ctrl.signal, cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) return null;
    sessionStorage.setItem(STATUS_CACHE_KEY, JSON.stringify({ t: Date.now(), data }));
    return data;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function timeAgo(ts) {
  const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** Thin strip under the menu when there's a notice, a problem, or the owner is away. */
async function showStatusBanner() {
  if (document.getElementById('statusPage')) return; // the status page shows everything itself
  const main = document.querySelector('main');
  if (!main) return;
  const needsServer = !!document.querySelector('#store, #productPage, #walletPage, #adminPage');
  const data = await fetchStatus();
  let text = '';
  let tone = 'info';
  if (!data) {
    if (!needsServer) return;
    text = 'The order server can\'t be reached right now. Orders, Discord login and CW Credits may not work.';
    tone = 'down';
  } else if (data.notice) {
    text = data.notice.text;
  } else if (data.services.some((x) => x.status !== 'ok')) {
    text = 'Some parts of the store have problems right now.';
    tone = 'down';
  } else if (data.availability.state === 'away') {
    text = 'Cold Works Production is away right now. Orders and CW Credits requests will be reviewed later.';
  } else {
    return;
  }
  const bar = el('div', `status-banner status-banner--${tone}`);
  bar.setAttribute('role', 'status');
  const link = el('a', null, 'See status');
  link.href = new URL('status.html', ROOT).href;
  bar.append(icon(tone === 'down' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-info'), el('span', null, text), link);
  main.prepend(bar);
}
showStatusBanner();

// A short message left by the login page (e.g. "Logged in as …"), shown once on the next page
(function showPendingToast() {
  const text = sessionStorage.getItem('cw_toast');
  if (!text) return;
  sessionStorage.removeItem('cw_toast');
  setTimeout(() => showToast(text), 300);
})();

// ---------- Cart (cart.html). Only products sold for CW Credits can be added. ----------
const CART_KEY = 'cw_cart';
const CART_MAX = 10;

function readCart() {
  try {
    const list = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(list) ? list.filter((k) => typeof k === 'string').slice(0, CART_MAX) : [];
  } catch (err) {
    return [];
  }
}
function writeCart(list) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(list.slice(0, CART_MAX))); } catch (err) { /* storage off */ }
  updateCartBadge();
}
/** Returns 'added', 'already' or 'full'. */
function addToCart(key) {
  const list = readCart();
  if (list.includes(key)) return 'already';
  if (list.length >= CART_MAX) return 'full';
  list.push(key);
  writeCart(list);
  return 'added';
}
function updateCartBadge() {
  const n = readCart().length;
  document.querySelectorAll('.cart-count').forEach((b) => {
    b.textContent = n ? String(n) : '';
    b.hidden = !n;
  });
}
updateCartBadge();
window.addEventListener('storage', (e) => { if (e.key === CART_KEY) updateCartBadge(); });

// ---------- Subscriptions (products with "subscription": "monthly" in catalog.json) ----------
function setButton(btn, text, iconClass) {
  btn.textContent = text;
  btn.prepend(icon(iconClass));
}
async function setupSubscribe(btn, p) {
  // Priority Listeners: YouTube channel instead of a note (shown on the Early Access page once delivered)
  let yt = null;
  if (p.key === 'priority-listeners') {
    const wrap = el('label', 'pl-yt');
    yt = el('input');
    Object.assign(yt, { type: 'url', maxLength: 200, placeholder: 'https://youtube.com/@yourchannel', autocomplete: 'url' });
    wrap.append(el('span', null, 'Your YouTube channel'), yt,
      el('small', 'w-sub', 'Shown with your username on the Priority Listeners page after your order is delivered.'));
    btn.before(wrap);
  }
  btn.addEventListener('click', async () => {
    if (!readLogin()) {
      rememberReturn();
      window.location.href = new URL('account.html', ROOT).href;
      return;
    }
    let youtube = '';
    if (yt) {
      youtube = yt.value.trim();
      if (!/^(https?:\/\/)?(www\.|m\.)?youtube\.com\/(@[\w.-]{3,30}|channel\/UC[\w-]{22}|c\/[\w.-]+|user\/[\w.-]+)\/?$/i.test(youtube)) {
        yt.focus();
        showToast('Add your YouTube channel link, e.g. https://youtube.com/@yourchannel');
        return;
      }
    }
    const price = fmtCredits(creditPrice(p));
    if (!window.confirm(`Subscribe to ${p.name} for ${price} CW Credits a month?\n\nThe first month is paid now from your balance. It renews every 30 days; you can cancel any time in your wallet.`)) return;
    btn.disabled = true;
    const { ok, data } = await creditsCall('subscribe', { product: p.key, youtube });
    if (ok) {
      const next = new Date(data.sub.next_due * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      sessionStorage.removeItem(STATUS_CACHE_KEY);
      showToast(data.resumed ? 'Your subscription continues.' : `Subscribed! Next payment on ${next}.`);
      setButton(btn, 'Subscribed', 'fa-solid fa-check');
      return;
    }
    showToast(data.error || 'Couldn\'t subscribe. Try again.');
    btn.disabled = false;
  });
  if (readLogin()) {
    const { ok, data } = await creditsCall('wallet');
    const mine = ok && (data.subs || []).find((x) => x.key === p.key && ['active', 'grace'].includes(x.status));
    if (mine) {
      setButton(btn, mine.status === 'grace' ? 'Payment due' : 'Subscribed', mine.status === 'grace' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-check');
      btn.disabled = true;
    }
  }
}

// ---------- Store: shared pieces ----------
const STORE = { query: '', filter: 'all', sort: 'featured' };

function productUrl(p) {
  return new URL(`product.html?item=${encodeURIComponent(p.key)}`, ROOT).href;
}

// A stable colour per product, used for the generated cover when there's no image
function hueFor(key) {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function productMedia(p) {
  if (p.image) {
    const img = el('img');
    img.src = new URL(p.image, ROOT).href;
    img.alt = p.name;
    img.loading = 'lazy';
    return img;
  }
  const cover = el('div', 'shop-cover');
  const hue = Number(p.hue);
  cover.style.setProperty('--h', Number.isFinite(hue) && p.hue !== null ? hue : hueFor(p.key)); // "hue" in catalog.json (0-360) picks the colour
  const name = /^fa-[a-z0-9-]+$/.test(p.icon || '') ? p.icon : 'fa-bag-shopping';
  cover.append(icon(`fa-solid ${name}`));
  return cover;
}

function badgesFor(p) {
  const wrap = el('div', 'shop-badges');
  if (STATUS_LABELS[p.status]) {
    const b = el('span', `shop-badge shop-badge--${p.status}`);
    b.append(el('span', null, STATUS_LABELS[p.status]));
    wrap.append(b);
  }
  if (p.featured) {
    const f = el('span', 'shop-badge shop-badge--featured');
    f.append(el('span', null, 'Featured'));
    wrap.append(f);
  }
  return wrap;
}

function starsFor(rating) {
  const box = el('span', 'shop-stars');
  box.setAttribute('aria-hidden', 'true');
  const r = Number(rating) || 0;
  for (let i = 1; i <= 5; i++) {
    box.append(icon(r >= i ? 'fa-solid fa-star' : r >= i - 0.5 ? 'fa-solid fa-star-half-stroke' : 'fa-regular fa-star'));
  }
  return box;
}

function metaFor(p) {
  const meta = el('div', 'shop-meta');
  const rate = el('span');
  if (p.reviews && p.rating != null) {
    rate.append(starsFor(p.rating), document.createTextNode(` ${ratingText(p)}`));
  } else {
    rate.append(icon('fa-regular fa-star'), document.createTextNode(' No reviews yet'));
  }
  const n = Number(p.orders) || 0;
  const orders = el('span');
  orders.append(icon('fa-solid fa-box'), document.createTextNode(` ${n} ${n === 1 ? 'order' : 'orders'}`));
  meta.append(rate, orders);
  return meta;
}

function productCard(p) {
  const url = productUrl(p);
  const card = el('article', `shop-card${p.featured ? ' is-featured' : ''}${p.status === 'full' ? ' is-full' : ''}`);

  // The picture is a second link to the same page: hide it from keyboard/screen readers
  const media = el('a', 'shop-card-media');
  media.href = url;
  media.tabIndex = -1;
  media.setAttribute('aria-hidden', 'true');
  media.append(productMedia(p), badgesFor(p));
  card.append(media);

  const body = el('div', 'shop-card-body');
  if (p.id != null) body.append(el('p', 'shop-card-id', `#${p.id}`));
  const title = el('h3', 'shop-card-title');
  const link = el('a', null, p.name);
  link.href = url;
  title.append(link);
  body.append(title);
  if (p.description) body.append(el('p', 'shop-card-desc', p.description));
  body.append(metaFor(p));

  const foot = el('div', 'shop-card-foot');
  foot.append(el('span', 'shop-price', priceLabel(p)));
  const view = el('a', 'shop-btn', 'View');
  view.href = url;
  view.setAttribute('aria-label', `View ${p.name}`);
  foot.append(view);
  body.append(foot);

  card.append(body);
  return card;
}

// ---------- Store page: search, filter, sort ----------
function visibleProducts() {
  const q = STORE.query.trim().toLowerCase();
  const list = CATALOG.filter((p) => {
    if (STORE.filter !== 'all' && p.status !== STORE.filter) return false;
    if (!q) return true;
    const text = [p.name, p.description, p.price, ...(Array.isArray(p.rules) ? p.rules : [])].join(' ').toLowerCase();
    return text.includes(q);
  });
  const position = new Map(CATALOG.map((p, i) => [p, i]));
  const sorters = {
    featured: (a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || position.get(a) - position.get(b),
    orders: (a, b) => (Number(b.orders) || 0) - (Number(a.orders) || 0) || position.get(a) - position.get(b),
    rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || position.get(a) - position.get(b),
    name: (a, b) => String(a.name).localeCompare(String(b.name)),
  };
  return list.sort(sorters[STORE.sort] || sorters.featured);
}

function renderCatalog() {
  const box = document.getElementById('catalog');
  if (!box) return;
  const count = document.getElementById('shopCount');
  box.replaceChildren();

  if (!CATALOG.length) {
    box.append(el('p', 'catalog-empty', 'The catalog is empty right now. Check back soon.'));
    if (count) count.textContent = '';
    return;
  }

  const list = visibleProducts();
  if (count) count.textContent = list.length ? `${list.length} ${list.length === 1 ? 'item' : 'items'}` : '';
  if (!list.length) {
    box.append(el('p', 'catalog-empty', 'No items match your search.'));
    return;
  }
  list.forEach((p) => box.append(productCard(p)));
}

(function setupStoreControls() {
  const search = document.getElementById('shopSearch');
  const sort = document.getElementById('shopSort');
  const chips = document.querySelectorAll('.shop-chip[data-filter]');
  if (search) search.addEventListener('input', () => { STORE.query = search.value; renderCatalog(); });
  if (sort) sort.addEventListener('change', () => { STORE.sort = sort.value; renderCatalog(); });
  chips.forEach((chip) => chip.addEventListener('click', () => {
    STORE.filter = chip.dataset.filter;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    renderCatalog();
  }));
})();

// ---------- Product page (product.html?item=<key>) ----------
function showToast(text) {
  let toast = document.querySelector('.shop-toast');
  if (!toast) {
    toast = el('div', 'shop-toast');
    toast.setAttribute('role', 'status');
    document.body.append(toast);
  }
  toast.textContent = text;
  toast.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

function pdSection(title) {
  const sec = el('section', 'pd-section');
  sec.append(el('h2', null, title));
  return sec;
}

function renderProductPage() {
  const root = document.getElementById('productPage');
  if (!root) return;
  root.replaceChildren();

  const key = new URLSearchParams(window.location.search).get('item');
  const p = CATALOG.find((x) => x.key === key);
  const storeUrl = new URL('index.html#store', ROOT).href;

  if (!p) {
    const box = el('div', 'pd-missing');
    box.append(el('h1', null, 'Product not found'),
      el('p', null, 'This product isn\'t in the store anymore, or the link is wrong.'));
    const back = el('a', 'shop-btn', 'Back to the store');
    back.href = storeUrl;
    box.append(back);
    root.append(box);
    document.title = 'Product not found — Fizzy\'s store';
    return;
  }

  document.title = `${p.name} — Fizzy's store`;

  const crumbs = el('nav', 'shop-crumbs');
  crumbs.setAttribute('aria-label', 'Breadcrumb');
  const home = el('a', null, 'Fizzy\'s store');
  home.href = storeUrl;
  crumbs.append(home, el('span', null, '/'), el('span', null, p.name));
  root.append(crumbs);

  const pd = el('div', 'pd');
  const media = el('div', `pd-media${p.status === 'full' ? ' shop-card is-full' : ''}`);
  media.append(productMedia(p));
  pd.append(media);

  const info = el('div', 'pd-info');
  info.append(badgesFor(p));
  if (p.id != null) info.append(el('p', 'pd-id', `#${p.id}`));
  info.append(el('h1', 'pd-title', p.name), metaFor(p));

  const buy = el('div', 'pd-buybox');
  const price = el('div');
  price.append(el('p', 'pd-price-label', 'Price'), el('p', 'pd-price', priceLabel(p)));
  buy.append(price);

  const isOpen = p.status === 'open';
  const status = el('p', `pd-status pd-status--${isOpen ? 'open' : 'full'}`);
  status.append(icon(isOpen ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark'),
    document.createTextNode(isOpen ? 'Open for orders' : 'Full right now'));
  buy.append(status);
  const note = STATUS_NOTES[p.key] && STATUS_NOTES[p.key][p.status];
  if (note) buy.append(el('p', 'pd-note', note));

  const actions = el('div', 'pd-actions');
  const credits = creditPrice(p);
  const isSub = !!(credits && p.subscription);
  const orderBtn = el('button', 'shop-btn', isOpen ? (isSub ? 'Subscribe' : credits ? 'Buy with CW Credits' : 'Order') : 'Full');
  orderBtn.type = 'button';
  orderBtn.prepend(icon(isSub ? 'fa-solid fa-rotate' : credits ? 'fa-solid fa-coins' : 'fa-solid fa-bag-shopping'));
  if (isOpen && isSub) setupSubscribe(orderBtn, p);
  else if (isOpen) orderBtn.addEventListener('click', () => openOrderDialog(p, credits ? 'buy' : 'order'));
  else orderBtn.disabled = true;

  const commentBtn = el('button', 'shop-btn shop-btn--ghost', 'Comment');
  commentBtn.type = 'button';
  commentBtn.prepend(icon('fa-regular fa-comment'));
  commentBtn.addEventListener('click', () => openOrderDialog(p, 'comment'));

  const shareBtn = el('button', 'shop-btn shop-btn--ghost', 'Copy link');
  shareBtn.type = 'button';
  shareBtn.prepend(icon('fa-solid fa-link'));
  shareBtn.addEventListener('click', async () => {
    const link = productUrl(p);
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: p.name, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      showToast('Link copied');
    } catch (err) {
      if (err && err.name === 'AbortError') return; // share sheet closed
      showToast('Couldn\'t copy the link');
    }
  });
  actions.append(orderBtn, commentBtn, shareBtn);
  if (credits && isOpen && !isSub) {
    const cartBtn = el('button', 'shop-btn shop-btn--ghost', readCart().includes(p.key) ? 'In your cart' : 'Add to cart');
    cartBtn.type = 'button';
    cartBtn.prepend(icon('fa-solid fa-cart-plus'));
    cartBtn.addEventListener('click', () => {
      const r = addToCart(p.key);
      if (r === 'full') return showToast(`Your cart can hold up to ${CART_MAX} items.`);
      cartBtn.textContent = 'In your cart';
      cartBtn.prepend(icon('fa-solid fa-cart-plus'));
      const go = r === 'added' ? 'Added to your cart.' : 'It\'s already in your cart.';
      showToast(go);
    });
    const viewCart = el('a', 'shop-btn shop-btn--ghost', 'View cart');
    viewCart.href = new URL('cart.html', ROOT).href;
    viewCart.prepend(icon('fa-solid fa-cart-shopping'));
    actions.append(cartBtn, viewCart);
  }
  buy.append(actions);

  const hint = el('p', 'pd-note');
  hint.append(icon('fa-brands fa-discord'),
    el('span', null, 'Log in with Discord or a CW PLAY account to order or comment. Orders are reviewed by hand and answered on Discord or by email.'));
  buy.append(hint);
  if (isSub) {
    const subNote = el('p', 'pd-note');
    subNote.append(icon('fa-solid fa-rotate'), el('span', null,
      'Renews every 30 days from your CW Credits. If your balance is too low, you have 24 hours to top up before it\'s cancelled. Cancel any time in your wallet.'
      + (p.license ? ' Includes a license key for the desktop program; your key and the download link are in your wallet.' : '')));
    buy.append(subNote);
  }
  if (credits) {
    const wallet = el('p', 'pd-note');
    const link = el('a', null, 'Open your wallet');
    link.href = new URL('wallet.html', ROOT).href;
    wallet.append(icon('fa-solid fa-wallet'), el('span', null, 'Need more CW Credits? '), link);
    buy.append(wallet);
  }
  info.append(buy);
  pd.append(info);
  root.append(pd);

  if (p.description) {
    const sec = pdSection('About this item');
    sec.append(el('p', null, p.description));
    root.append(sec);
  }

  if (Array.isArray(p.rules) && p.rules.length) {
    const sec = pdSection('Good to know');
    const ul = el('ul', 'pd-rules');
    p.rules.forEach((r) => {
      const li = el('li');
      li.append(icon('fa-solid fa-circle-info'), el('span', null, r));
      ul.append(li);
    });
    sec.append(ul);
    root.append(sec);
  }

  if (p.page) {
    const sec = pdSection('More details');
    const more = el('a', 'shop-btn shop-btn--ghost', 'Open the details page');
    more.href = new URL(p.page, ROOT).href;
    more.append(icon('fa-solid fa-arrow-right'));
    sec.append(more);
    root.append(sec);
  }

  // reviews (approved ones, newest first)
  const revSec = pdSection('Reviews');
  revSec.append(el('p', 'w-sub', 'Loading reviews…'));
  root.append(revSec);
  fetch(`${STATUS_API}?reviews=${encodeURIComponent(p.key)}&t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json()).catch(() => ({}))
    .then((d) => {
      const list = (d && d.reviews) || [];
      revSec.replaceChildren(el('h2', null, 'Reviews'));
      if (!list.length) {
        revSec.append(el('p', null, 'No written reviews yet. Customers can review a product after their order is delivered.'));
        return;
      }
      const ul = el('ul', 'rv-list');
      list.forEach((r) => {
        const li = el('li');
        const top = el('div', 'rv-top');
        top.append(el('span', 'rv-stars-static', '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars)), el('strong', null, r.u),
          el('span', 'w-sub', new Date(r.created * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })));
        li.append(top);
        if (r.text) li.append(el('p', null, r.text));
        ul.append(li);
      });
      revSec.append(ul);
    });

  const others = CATALOG.filter((x) => x.key !== p.key);
  if (others.length) {
    const sec = pdSection('More from the store');
    const grid = el('div', 'shop-grid');
    others.slice(0, 3).forEach((x) => grid.append(productCard(x)));
    sec.append(grid);
    root.append(sec);
  }
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
    const inBtn = el('a', 'btn btn-ghost', 'Log in');
    inBtn.href = new URL('account.html', ROOT).href;
    inBtn.addEventListener('click', rememberReturn);
    loginRow.append(inBtn, el('small', null, 'With Discord or a CW PLAY account. Required to send an order or comment.'));
  }
}

function applyLoginToField() {
  const login = readLogin();
  form.username.readOnly = true; // the logged-in account is used, so the field is never typed in
  form.username.value = login ? login.u : '';
  form.username.placeholder = login ? '' : 'Log in first';
  document.getElementById('orderSubmit').disabled = !login;
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
  const isBuy = type === 'buy';
  document.getElementById('orderTitle').textContent = isComment ? 'Leave a comment' : isBuy ? 'Buy with CW Credits' : 'Place an order';
  document.getElementById('orderProduct').textContent =
    product.id != null ? `#${product.id} — ${product.name}` : product.name;
  document.getElementById('messageLabel').textContent = isComment ? 'Comment' : 'Note (optional)';
  form.message.required = isComment;
  document.getElementById('orderSubmit').textContent = isComment ? 'Send comment'
    : isBuy ? `Buy for ${fmtCredits(creditPrice(product))} CW Credits` : 'Send order';
  if (isBuy && readLogin()) {
    // Show the price and the visitor's balance under the product name
    const line = document.getElementById('orderProduct');
    line.textContent += ` · ${priceLabel(product)}`;
    creditsCall('wallet').then(({ ok, data }) => {
      if (ok && current && current.product === product) line.textContent += ` · Your balance: ${fmtCredits(data.balance)}`;
    });
  }

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
    if (!readLogin()) {
      setError('Log in to send this.');
      return;
    }

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
      const res = await fetch(current.type === 'buy' ? CREDITS_API : ORDER_API, {
        method: 'POST',
        // text/plain = "simple request": no OPTIONS pre-check, which IIS can block
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({
          action: 'buy', // only read by credits.php
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
      sessionStorage.removeItem(STATUS_CACHE_KEY); // so the new order shows up in the count right away
      const no = data.order ? `Order #${data.order}. ` : '';
      document.getElementById('orderDoneText').textContent = current.type === 'buy'
        ? `${no}Purchased! Your new balance is ${fmtCredits(data.balance)} CW Credits. You can follow it under “My orders” in your wallet.`
        : current.type === 'comment'
        ? 'Your comment reached us. Thank you.'
        : `${no}Your order reached us. You can follow it under “My orders” in your wallet.`;
      form.querySelector('.order-body').hidden = true;
      form.querySelector('.order-done').hidden = false;
    } catch (err) {
      console.error('Order request failed:', err);
      setError('Couldn\'t connect. Check your connection and try again.');
    } finally {
      submit.disabled = !readLogin();
      submit.textContent = label;
    }
  });
}

// ---------- Start ----------
loadCatalog()
  .then((products) => {
    CATALOG = products;
    applyStatuses(products);
    renderCatalog();
    renderProductPage();
  })
  .catch(() => {
    const box = document.getElementById('catalog');
    if (box) {
      box.replaceChildren(el('p', 'catalog-empty',
        'The catalog couldn\'t be loaded. Refresh the page, or find it in Fizzy\'s catalog on Discord.'));
    }
    const page = document.getElementById('productPage');
    if (page) {
      page.replaceChildren(el('p', 'catalog-empty',
        'The product couldn\'t be loaded. Refresh the page, or find it in Fizzy\'s catalog on Discord.'));
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
