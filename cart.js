// =========================================================
//  Cart (cart.html): products sold for CW Credits, paid in one go.
//  Uses helpers from script.js: el, icon, loadCatalog, readCart, writeCart,
//  creditPrice, fmtCredits, readLogin, creditsCall, loginLink, showToast, ROOT.
// =========================================================

(function () {
  const root = document.getElementById('cartPage');
  if (!root) return;

  function header() {
    const head = el('header', 'shop-head');
    const t = el('div');
    t.append(el('span', 'shop-kicker', 'Fizzy Littlejoy'), el('h2', null, 'Your cart'),
      el('p', null, 'Products sold for CW Credits. Pay for everything at once; orders are reviewed by hand.'));
    const store = el('a', 'shop-btn shop-btn--ghost', 'Keep shopping');
    store.href = new URL('index.html#store', ROOT).href;
    store.prepend(icon('fa-solid fa-store'));
    head.append(t, store);
    return head;
  }

  function emptyView(text) {
    const box = el('div', 'pd-buybox cart-empty');
    const store = el('a', 'shop-btn', 'Go to the store');
    store.href = new URL('index.html#store', ROOT).href;
    box.append(icon('fa-solid fa-cart-shopping'), el('p', 'pd-price', 'Your cart is empty'), el('p', null, text), store);
    root.replaceChildren(header(), box);
  }

  function doneView(balance, orderNo) {
    const box = el('div', 'pd-buybox cart-empty');
    const wallet = el('a', 'shop-btn shop-btn--ghost', 'Open your wallet');
    wallet.href = new URL('wallet.html', ROOT).href;
    box.append(icon('fa-solid fa-circle-check'), el('p', 'pd-price', 'Order sent'),
      el('p', null, `${orderNo ? `Order #${orderNo}. ` : ''}Your new balance is ${fmtCredits(balance)} CW Credits. Follow your order under “My orders” in your wallet.`), wallet);
    root.replaceChildren(header(), box);
  }

  async function render() {
    root.replaceChildren(header(), el('p', 'catalog-empty', 'Loading your cart…'));
    let products;
    try {
      products = await loadCatalog();
    } catch (err) {
      root.replaceChildren(header(), el('p', 'catalog-empty', 'The store couldn\'t be loaded. Try again later.'));
      return;
    }

    // Keep only items that still exist, are sold for credits and are open
    const keys = readCart();
    const items = [];
    const removed = [];
    keys.forEach((k) => {
      const p = products.find((x) => x.key === k);
      if (p && creditPrice(p) && p.status === 'open' && !p.subscription) items.push(p);
      else removed.push(p ? p.name : k);
    });
    if (removed.length) writeCart(items.map((p) => p.key));
    if (!items.length) {
      emptyView(removed.length ? 'Some items were removed because they\'re no longer available.' : 'Add products sold for CW Credits from the store.');
      return;
    }

    // discounts shown here are an estimate; the server calculates the final price at checkout
    const bundle = DISCOUNTS.bundle && items.length >= DISCOUNTS.bundle.min ? DISCOUNTS.bundle.percent : 0;
    const pctFor = (p) => Math.max(salePercent(p), bundle);
    const listTotal = items.reduce((sum, p) => sum + creditPrice(p), 0);
    const total = items.reduce((sum, p) => sum + discountedPrice(creditPrice(p), pctFor(p)), 0);

    // Item list
    const list = el('ul', 'wallet-list');
    items.forEach((p) => {
      const li = el('li');
      const main = el('div', 'w-main');
      const name = el('a', 'cart-name', p.name);
      name.href = new URL(`product.html?item=${encodeURIComponent(p.key)}`, ROOT).href;
      main.append(name);
      if (p.id != null) main.append(el('span', 'w-sub', `#${p.id}`));
      const right = el('div', 'adm-adjust');
      const remove = el('button', 'shop-btn shop-btn--ghost', 'Remove');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        writeCart(readCart().filter((k) => k !== p.key));
        render();
      });
      right.append(priceEl('span', 'w-amount', p, pctFor(p)), remove);
      li.append(main, right);
      list.append(li);
    });
    const itemsSection = el('section', 'cart-items');
    itemsSection.append(list);
    if (removed.length) itemsSection.append(el('p', 'w-sub', 'Some items were removed because they\'re no longer available.'));

    // Checkout box
    const box = el('div', 'pd-buybox');
    const totalEl = el('p', 'pd-price');
    if (total < listTotal) totalEl.append(el('del', 'price-old', fmtCredits(listTotal)), document.createTextNode(' '));
    totalEl.append(document.createTextNode(`${fmtCredits(total)} CW Credits`));
    box.append(el('p', 'pd-price-label', 'Total'), totalEl, el('p', 'w-sub', `${items.length} item${items.length === 1 ? '' : 's'}`));
    const hints = [];
    if (DISCOUNTS.bundle && items.length < DISCOUNTS.bundle.min) hints.push(`Add ${DISCOUNTS.bundle.min - items.length} more product${DISCOUNTS.bundle.min - items.length === 1 ? '' : 's'} for ${DISCOUNTS.bundle.percent}% off.`);
    if (DISCOUNTS.first) hints.push(`First purchase? You get ${DISCOUNTS.first.percent}% off at checkout if it's bigger than your other discounts.`);
    if (hints.length) box.append(el('p', 'w-sub', hints.join(' ')));

    if (!readLogin()) {
      box.append(el('p', 'pd-note', 'Log in to pay with your CW Credits.'), loginLink());
      return void root.replaceChildren(header(), wrap(itemsSection, box));
    }

    const balanceLine = el('p', 'pd-note', 'Checking your balance…');
    box.append(balanceLine);
    const form = el('form', 'wallet-form');
    form.noValidate = true;
    const noteWrap = el('label');
    const note = el('textarea');
    Object.assign(note, { maxLength: 200, rows: 3, placeholder: 'Anything we should know? (optional)' });
    noteWrap.append(el('span', null, 'Note (optional)'), note);
    const hp = el('input');
    Object.assign(hp, { type: 'text', tabIndex: -1, autocomplete: 'off' });
    hp.className = 'hp';
    hp.setAttribute('aria-hidden', 'true');
    const err = el('p', 'wallet-error');
    err.setAttribute('role', 'alert');
    const pay = el('button', 'shop-btn shop-btn--block', `Pay ${fmtCredits(total)} CW Credits`);
    pay.type = 'submit';
    pay.disabled = true;
    form.append(noteWrap, hp, err, pay);
    box.append(form, el('p', 'pd-note', 'Orders are reviewed by hand and not around the clock, so replies can take a while.'));
    root.replaceChildren(header(), wrap(itemsSection, box));

    const { ok, data } = await creditsCall('wallet');
    if (!ok) {
      if (data.login) return void render();
      balanceLine.textContent = data.error || 'Your balance couldn\'t be checked.';
      return;
    }
    const enough = data.balance >= total;
    balanceLine.textContent = `Your balance: ${fmtCredits(data.balance)} CW Credits`;
    if (!enough) {
      const w = el('a', null, 'Request more in your wallet');
      w.href = new URL('wallet.html', ROOT).href;
      err.append(`You need ${fmtCredits(total - data.balance)} more CW Credits. `, w);
    }
    pay.disabled = !enough;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      pay.disabled = true;
      pay.textContent = 'Sending…';
      const r = await creditsCall('buy_cart', { products: items.map((p) => p.key), message: note.value.trim(), website: hp.value });
      if (r.ok) {
        writeCart([]);
        sessionStorage.removeItem(STATUS_CACHE_KEY);
        doneView(r.data.balance, r.data.order);
        return;
      }
      if (r.data.login) return void render();
      err.textContent = r.data.error || 'Your order couldn\'t be sent. Try again.';
      pay.textContent = `Pay ${fmtCredits(total)} CW Credits`;
      pay.disabled = false;
    });
  }

  function wrap(left, right) {
    const grid = el('div', 'cart-grid');
    grid.append(left, right);
    return grid;
  }

  render();
})();
