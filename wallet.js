// =========================================================
//  CW Credits wallet (wallet.html)
//  Uses helpers from script.js: el, icon, readLogin, creditsCall, loginLink,
//  fmtCredits, showToast, LOGIN_KEY, ROOT.
// =========================================================

(function () {
  const root = document.getElementById('walletPage');
  if (!root) return;

  const STATUS = { pending: 'Waiting for approval', approved: 'Approved', rejected: 'Declined' };
  const when = (ts) => new Date(ts * 1000).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  function header() {
    const head = el('header', 'shop-head');
    const text = el('div');
    text.append(
      el('span', 'shop-kicker', 'Fizzy Littlejoy'),
      el('h2', null, 'CW Credits'),
      el('p', null, 'Your balance for Fizzy\'s store. Request CW Credits here, and spend them on products that are sold for credits.'),
    );
    const store = el('a', 'shop-btn shop-btn--ghost', 'Go to the store');
    store.href = new URL('index.html#store', ROOT).href;
    store.prepend(icon('fa-solid fa-store'));
    head.append(text, store);
    return head;
  }

  function loginView() {
    const box = el('div', 'pd-buybox wallet-login');
    box.append(
      el('p', 'pd-price', 'Log in to see your wallet'),
      el('p', 'pd-note', 'Log in with Discord or a CW PLAY account. Your CW Credits are tied to the account you log in with.'),
      loginLink(),
    );
    root.append(box);
  }

  function userRow(name, isOwner) {
    const row = el('p', 'wallet-user');
    row.append(icon('fa-solid fa-circle-user'), el('span', null, `Logged in as ${name}`));
    const out = el('button', null, 'Log out');
    out.type = 'button';
    out.addEventListener('click', () => {
      sessionStorage.removeItem(LOGIN_KEY);
      render();
    });
    row.append(out);
    if (isOwner) {
      const admin = el('a', null, 'Open admin');
      admin.href = new URL('admin.html', ROOT).href;
      row.append(admin);
    }
    return row;
  }

  function balanceBox(balance) {
    const box = el('div', 'pd-buybox');
    const amount = el('p', 'wallet-balance');
    amount.append(icon('fa-solid fa-coins'), el('span', null, fmtCredits(balance)));
    box.append(el('p', 'pd-price-label', 'Balance'), amount, el('p', 'wallet-unit', 'CW Credits'),
      el('p', 'pd-note', 'CW Credits can\'t be bought with money or turned into money. They\'re only for Fizzy\'s store.'));
    return box;
  }

  function requestBox(pending) {
    const box = el('div', 'pd-buybox');
    box.append(el('p', 'pd-price-label', 'Add CW Credits'));

    if (pending) {
      box.append(
        el('p', 'pd-price', `${fmtCredits(pending.amount)} CW Credits requested`),
        el('p', 'pd-status pd-status--pending', STATUS.pending),
        el('p', 'pd-note', `Sent on ${when(pending.ts)}. Requests are reviewed by hand and not around the clock, so this can take a while. You can send a new request after this one is decided.`),
      );
      return box;
    }

    const form = el('form', 'wallet-form');
    form.noValidate = true;

    const amountLabel = el('label');
    const amount = el('input');
    Object.assign(amount, { type: 'number', name: 'amount', min: '1', step: '1', inputMode: 'numeric', required: true, placeholder: 'e.g. 500' });
    amountLabel.append(el('span', null, 'Amount'), amount);

    const noteLabel = el('label');
    const note = el('textarea');
    Object.assign(note, { name: 'note', maxLength: 200, rows: 3, placeholder: 'What is it for? (optional)' });
    noteLabel.append(el('span', null, 'Note (optional)'), note);

    const error = el('p', 'wallet-error');
    error.setAttribute('role', 'alert');
    const submit = el('button', 'shop-btn shop-btn--block', 'Request CW Credits');
    submit.type = 'submit';
    submit.prepend(icon('fa-solid fa-plus'));

    form.append(amountLabel, noteLabel,
      el('p', 'pd-note', 'CW Credits isn\'t a 24/7 service. Every request is reviewed and added by hand, so it can take a while, for example overnight. Unrealistic amounts are declined.'),
      error, submit);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      error.textContent = '';
      const value = amount.value.trim();
      if (!/^\d+$/.test(value) || Number(value) < 1) {
        error.textContent = 'Enter a whole number of CW Credits.';
        amount.focus();
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Sending…';
      const { ok, data } = await creditsCall('request', { amount: Number(value), note: note.value.trim() });
      if (ok) {
        showToast('Your request was sent.');
        render();
        return;
      }
      if (data.login) {
        render();
        return;
      }
      error.textContent = data.error || 'Your request couldn\'t be sent. Try again.';
      submit.disabled = false;
      submit.textContent = 'Request CW Credits';
      submit.prepend(icon('fa-solid fa-plus'));
    });

    box.append(form);
    return box;
  }

  function listSection(title, items, empty, renderItem) {
    const section = el('section', 'pd-section');
    section.append(el('h2', null, title));
    if (!items.length) {
      section.append(el('p', null, empty));
      return section;
    }
    const list = el('ul', 'wallet-list');
    items.forEach((item) => list.append(renderItem(item)));
    section.append(list);
    return section;
  }

  function requestItem(r) {
    const li = el('li');
    const main = el('div', 'w-main');
    main.append(el('span', 'w-amount', `${fmtCredits(r.amount)} CW Credits`),
      el('span', 'w-sub', r.note ? `${when(r.ts)} · ${r.note}` : when(r.ts)));
    li.append(main, el('span', `w-status w-status--${r.status}`, STATUS[r.status] || r.status));
    return li;
  }

  function historyItem(h) {
    const li = el('li');
    const main = el('div', 'w-main');
    main.append(el('span', null, h.reason), el('span', 'w-sub', `${when(h.ts)} · Balance after: ${fmtCredits(h.bal)}`));
    const sign = h.delta > 0 ? '+' : '−';
    li.append(main, el('span', `w-amount ${h.delta > 0 ? 'w-plus' : 'w-minus'}`, `${sign}${fmtCredits(Math.abs(h.delta))}`));
    return li;
  }

  let productsByKey = {};
  let maxDevices = 2;
  const day = (ts) => new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  function subItem(x) {
    const li = el('li');
    const main = el('div', 'w-main');
    const name = el('a', 'cart-name', x.name);
    name.href = new URL(`product.html?item=${encodeURIComponent(x.key)}`, ROOT).href;
    const price = `${fmtCredits(x.price)} CW Credits / month`;
    const line = {
      active: `Renews on ${day(x.next_due)} · ${price}`,
      grace: `Payment due: add CW Credits before ${when(x.grace_until)} or it will be cancelled · ${price}`,
      cancelling: `Cancelled · active until ${day(x.next_due)}`,
      cancelled: x.reason === 'unpaid' ? 'Cancelled because it couldn\'t be paid' : 'Ended',
    }[x.status] || price;
    main.append(name, el('span', 'w-sub', line));
    if (x.license) {
      // Desktop program: license key, computers and download
      const row = el('div', 'lic-row');
      const copy = el('button', 'shop-btn shop-btn--ghost', 'Copy key');
      copy.type = 'button';
      copy.prepend(icon('fa-solid fa-copy'));
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(x.license);
          showToast('License key copied.');
        } catch (err) {
          showToast('Select the key and copy it.');
        }
      });
      row.append(el('code', 'lic-key', x.license), copy);
      const prod = productsByKey[x.key];
      if (prod && prod.download && ['active', 'grace', 'cancelling'].includes(x.status)) {
        const dl = el('a', 'shop-btn', 'Download');
        dl.href = prod.download;
        dl.prepend(icon('fa-solid fa-download'));
        row.append(dl);
      }
      main.append(row, el('span', 'w-sub', `License used on ${x.devices || 0} of ${maxDevices} computers`));
    }
    const chip = { active: ['approved', 'Active'], grace: ['pending', 'Payment due'], cancelling: ['pending', 'Ending'], cancelled: ['rejected', 'Ended'] }[x.status] || ['pending', x.status];
    const right = el('div', 'adm-actions');
    right.append(el('span', `w-status w-status--${chip[0]}`, chip[1]));
    if (x.status === 'active' || x.status === 'grace') {
      const cancel = el('button', 'shop-btn shop-btn--ghost', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', async () => {
        const msg = x.status === 'active'
          ? `Cancel ${x.name}? It stays active until ${day(x.next_due)} and won't renew.`
          : `Cancel ${x.name} now?`;
        if (!window.confirm(msg)) return;
        cancel.disabled = true;
        const { ok, data } = await creditsCall('cancel_sub', { id: x.id });
        showToast(ok ? 'Subscription cancelled.' : (data.error || 'Couldn\'t cancel. Try again.'));
        render();
      });
      right.append(cancel);
    }
    li.append(main, right);
    return li;
  }

  async function render() {
    root.replaceChildren(header());
    if (!readLogin()) {
      loginView();
      return;
    }
    const loading = el('p', 'catalog-empty', 'Loading your wallet…');
    root.append(loading);
    const { ok, data } = await creditsCall('wallet');
    loading.remove();
    if (!ok) {
      if (data.login) loginView();
      else root.append(el('p', 'catalog-empty', data.error || 'Your wallet couldn\'t be loaded. Try again later.'));
      return;
    }

    const pending = (data.requests || []).find((r) => r.status === 'pending');
    const grid = el('div', 'wallet-grid');
    grid.append(balanceBox(data.balance), requestBox(pending));
    const subs = data.subs || [];
    maxDevices = data.max_devices || 2;
    if (subs.some((x) => x.license)) {
      try { (await loadCatalog()).forEach((p) => { productsByKey[p.key] = p; }); } catch (err) { /* no download links */ }
    }
    const due = subs.filter((x) => x.status === 'grace');
    if (due.length) {
      const warn = el('div', 'st-overall st-overall--down');
      const t = el('div');
      t.append(el('p', 'st-overall-title', 'A subscription payment is due'),
        el('p', 'st-overall-text', due.map((x) => `${x.name}: ${fmtCredits(x.price)} CW Credits before ${when(x.grace_until)}`).join(' · ')));
      warn.append(icon('fa-solid fa-triangle-exclamation'), t);
      root.append(warn);
    }
    root.append(
      userRow(data.user, data.owner),
      grid,
      ...(subs.length ? [listSection('Subscriptions', subs, '', subItem)] : []),
      listSection('Your requests', data.requests || [], 'You haven\'t requested any CW Credits yet.', requestItem),
      listSection('Activity', data.history || [], 'No activity yet.', historyItem),
    );
  }

  render();
})();
