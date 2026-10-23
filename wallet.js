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

  // ---------- My orders: tracking, delivered files, reviews
  const ORDER_CHIP = { received: ['pending', 'Received'], in_progress: ['pending', 'In progress'], delivered: ['approved', 'Delivered'], cancelled: ['rejected', 'Cancelled'] };
  const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  async function downloadFile(f, btn) {
    btn.disabled = true;
    const { ok, data } = await creditsCall('order_file', { id: f.id });
    btn.disabled = false;
    if (!ok) return showToast(data.error || 'The file couldn\'t be downloaded.');
    const bytes = Uint8Array.from(atob(data.data), (ch) => ch.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: data.mime }));
    const a = el('a');
    a.href = url;
    a.download = data.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function reviewForm(o, item) {
    const box = el('div', 'rv-form');
    let stars = 0;
    const row = el('div', 'rv-stars');
    const btns = [1, 2, 3, 4, 5].map((n) => {
      const b = el('button', 'rv-star', '☆');
      b.type = 'button';
      b.setAttribute('aria-label', `${n} star${n > 1 ? 's' : ''}`);
      b.addEventListener('click', () => {
        stars = n;
        btns.forEach((x, i) => { x.textContent = i < n ? '★' : '☆'; });
      });
      row.append(b);
      return b;
    });
    const text = el('textarea');
    Object.assign(text, { maxLength: 500, rows: 2, placeholder: 'What did you think? (optional)' });
    const send = el('button', 'shop-btn', 'Send review');
    send.type = 'button';
    send.addEventListener('click', async () => {
      if (!stars) return showToast('Choose 1 to 5 stars.');
      send.disabled = true;
      const { ok, data } = await creditsCall('review', { order: o.id, product: item.key, stars, text: text.value.trim() });
      if (ok) {
        showToast('Thanks! Your review will appear after it\'s approved.');
        render();
      } else {
        showToast(data.error || 'Your review couldn\'t be sent.');
        send.disabled = false;
      }
    });
    box.append(el('span', 'w-sub', `Review ${item.name}:`), row, text, send);
    return box;
  }

  // simple chat thread used for CW PLAY Cinema orders
  function chatBox(messages, me, send) {
    const box = el('div', 'chat');
    const list = el('div', 'chat-list');
    const names = { customer: 'You', owner: 'Cold Works Production' };
    if (me === 'owner') { names.customer = 'Customer'; names.owner = 'You'; }
    messages.forEach((m) => {
      const b = el('div', `chat-msg ${m.who === me ? 'is-me' : ''}`);
      b.append(el('span', 'chat-who', `${names[m.who] || m.who} · ${when(m.created)}`), el('span', null, m.text));
      list.append(b);
    });
    if (!messages.length) list.append(el('span', 'w-sub', me === 'customer' ? 'Questions about your screening? Write to us here.' : 'No messages yet.'));
    const row = el('div', 'chat-row');
    const input = el('textarea');
    Object.assign(input, { rows: 2, maxLength: 1000, placeholder: 'Write a message…' });
    const btn = el('button', 'shop-btn', 'Send');
    btn.type = 'button';
    btn.addEventListener('click', async () => {
      const text = input.value.trim();
      if (!text) return;
      btn.disabled = true;
      const { ok, data } = await send(text);
      btn.disabled = false;
      if (ok) {
        showToast('Message sent.');
        render();
      } else {
        showToast(data.error || 'Your message couldn\'t be sent.');
      }
    });
    row.append(input, btn);
    box.append(list, row);
    return box;
  }
  window.cwChatBox = chatBox;

  function orderItem(o) {
    const li = el('li', 'ord');
    const main = el('div', 'w-main');
    const names = o.items.map((i) => i.name + (i.price ? ` (${fmtCredits(i.price)} CW Credits)` : '')).join(', ');
    const kind = { order: 'Order', credits: 'CW Credits', cart: 'Cart', subscription: 'Subscription' }[o.kind] || o.kind;
    main.append(el('span', 'w-amount', `#${o.id} · ${names}`), el('span', 'w-sub', `${kind} · ${when(o.created)}${o.note ? ` · “${o.note}”` : ''}`));
    // delivered files
    (o.files || []).forEach((f) => {
      const row = el('div', 'lic-row');
      const dl = el('button', 'shop-btn shop-btn--ghost', `${f.name} (${fmtSize(f.size)})`);
      dl.type = 'button';
      dl.prepend(icon('fa-solid fa-download'));
      dl.addEventListener('click', () => downloadFile(f, dl));
      row.append(dl);
      main.append(row);
    });
    // CW PLAY Cinema: screening details + chat with us
    if (o.cinema) {
      const sc = o.screening || {};
      const box = el('div', 'cin-box');
      box.append(el('span', 'cin-title', '🎬 Your screening'));
      if (sc.when || sc.link || sc.note) {
        if (sc.when) box.append(el('span', null, `When: ${sc.when}`));
        if (sc.note) box.append(el('span', 'w-sub', sc.note));
        if (sc.link) {
          const go = el('a', 'shop-btn', 'Open screening');
          go.href = sc.link;
          go.target = '_blank';
          go.rel = 'noopener';
          box.append(go);
        }
      } else {
        box.append(el('span', 'w-sub', 'We\'ll add the date and link here soon.'));
      }
      main.append(box, chatBox(o.messages || [], 'customer', async (text) => creditsCall('order_message', { order: o.id, text })));
    }
    // reviews (after delivery)
    if (o.status === 'delivered') {
      o.items.forEach((item) => {
        const done = o.reviews && o.reviews[item.key];
        if (done) {
          main.append(el('span', 'w-sub', `Your review of ${item.name}: ${'★'.repeat(done.stars)}${'☆'.repeat(5 - done.stars)} · `
            + ({ pending: 'waiting for approval', approved: 'published', rejected: 'not published' }[done.status] || done.status)));
        } else if (item.key) {
          main.append(reviewForm(o, item));
        }
      });
    }
    const [tone, label] = ORDER_CHIP[o.status] || ['pending', o.status];
    li.append(main, el('span', `w-status w-status--${tone}`, label));
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
    // Priority Listeners: previews to listen to here (only while the subscription is active)
    const previewsSection = el('section', 'pd-section');
    previewsSection.hidden = true;
    creditsCall('previews').then(({ ok: good, data: pd }) => {
      if (!good || !pd.listener) return;
      previewsSection.hidden = false;
      previewsSection.append(el('h2', null, 'Your previews'),
        el('p', 'w-sub', 'Priority Listeners previews. They\'re personal: please don\'t share or re-upload them.'));
      const list = pd.previews || [];
      if (!list.length) {
        previewsSection.append(el('p', null, 'No previews yet. You\'ll get an email (with a CW PLAY account) when the next one is ready.'));
        return;
      }
      const ul = el('ul', 'wallet-list');
      list.forEach((pv) => {
        const li = el('li', 'ord');
        const main = el('div', 'w-main');
        main.append(el('span', 'w-amount', pv.title), el('span', 'w-sub', when(pv.created)));
        if (pv.note) main.append(el('span', 'w-note', pv.note));
        const play = el('button', 'shop-btn', 'Listen');
        play.type = 'button';
        play.prepend(icon('fa-solid fa-play'));
        play.addEventListener('click', async () => {
          play.disabled = true;
          const r = await creditsCall('preview_file', { id: pv.id });
          if (!r.ok) {
            play.disabled = false;
            return showToast(r.data.error || 'The preview couldn\'t be loaded.');
          }
          const bytes = Uint8Array.from(atob(r.data.data), (ch) => ch.charCodeAt(0));
          const audio = el('audio');
          audio.controls = true;
          audio.setAttribute('controlsList', 'nodownload noplaybackrate');
          audio.addEventListener('contextmenu', (e) => e.preventDefault());
          audio.className = 'pv-audio';
          audio.src = URL.createObjectURL(new Blob([bytes], { type: r.data.mime }));
          play.replaceWith(audio);
          audio.play().catch(() => {});
        });
        main.append(play);
        li.append(main);
        ul.append(li);
      });
      previewsSection.append(ul);
    });
    const ordersSection = el('section', 'pd-section');
    ordersSection.append(el('h2', null, 'My orders'), el('p', 'w-sub', 'Loading…'));
    creditsCall('orders').then(({ ok: good, data: od }) => {
      const list = (good && od.orders) || [];
      ordersSection.replaceChildren(el('h2', null, 'My orders'));
      if (!list.length) {
        ordersSection.append(el('p', null, 'You haven\'t ordered anything yet.'));
        return;
      }
      const ul = el('ul', 'wallet-list');
      list.forEach((o) => ul.append(orderItem(o)));
      ordersSection.append(ul);
    });
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
      previewsSection,
      ordersSection,
      listSection('Your requests', data.requests || [], 'You haven\'t requested any CW Credits yet.', requestItem),
      listSection('Activity', data.history || [], 'No activity yet.', historyItem),
    );
  }

  render();
})();
