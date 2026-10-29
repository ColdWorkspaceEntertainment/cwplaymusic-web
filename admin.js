// =========================================================
//  CW Credits admin (admin.html) — only works for the store owner.
//  The server checks the Discord login against OWNER_DISCORD_ID; this page
//  just shows what the server allows.
//  Uses helpers from script.js: el, icon, readLogin, creditsCall, loginLink,
//  fmtCredits, showToast, ROOT.
// =========================================================

(function () {
  const root = document.getElementById('adminPage');
  if (!root) return;

  const when = (ts) => new Date(ts * 1000).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  function header(count) {
    const head = el('header', 'shop-head');
    const text = el('div');
    text.append(
      el('span', 'shop-kicker', 'Admin'),
      el('h2', null, 'CW Credits'),
      el('p', null, count == null ? 'Review credit requests and balances.'
        : count === 0 ? 'No requests are waiting.' : `${count} request${count === 1 ? ' is' : 's are'} waiting for you.`),
    );
    const refresh = el('button', 'shop-btn shop-btn--ghost', 'Refresh');
    refresh.type = 'button';
    refresh.prepend(icon('fa-solid fa-rotate'));
    refresh.addEventListener('click', render);
    head.append(text, refresh);
    return head;
  }

  function section(title, child) {
    const s = el('section', 'pd-section');
    s.append(el('h2', null, title), child);
    return s;
  }

  async function act(button, action, extra, success) {
    button.disabled = true;
    const { ok, data } = await creditsCall(action, extra);
    if (ok) {
      showToast(success);
      render();
    } else {
      showToast(data.error || 'That didn\'t work. Try again.');
      button.disabled = false;
    }
  }

  // Availability + notice shown on status.html and in the banner on every page
  function statusSection() {
    // Needs the status helpers in script.js. If an older script.js is cached, only this section is skipped.
    if (typeof fetchStatus !== 'function' || typeof STATUS_API === 'undefined') {
      return section('Your status', el('p', null,
        'Status settings couldn\'t load because an older version of the site is cached. Refresh the page with Ctrl+F5.'));
    }
    const form = el('form', 'wallet-form adm-status');
    form.noValidate = true;

    const availLabel = el('label');
    const select = el('select');
    [['available', 'Available'], ['busy', 'Busy'], ['away', 'Away']].forEach(([value, text]) => {
      const o = el('option', null, text);
      o.value = value;
      select.append(o);
    });
    availLabel.append(el('span', null, 'Your availability'), select);

    const noteLabel = el('label');
    const note = el('input');
    Object.assign(note, { type: 'text', maxLength: 140, placeholder: 'e.g. Back tomorrow morning (optional)' });
    noteLabel.append(el('span', null, 'Short note (optional)'), note);

    const noticeLabel = el('label');
    const notice = el('textarea');
    Object.assign(notice, { maxLength: 240, rows: 2, placeholder: 'Shown at the top of every page. Leave empty for none.' });
    noticeLabel.append(el('span', null, 'Notice for all pages (optional)'), notice);

    const save = el('button', 'shop-btn', 'Save status');
    save.type = 'submit';
    const link = el('a', 'adm-link', 'Open the status page');
    link.href = new URL('status.html', ROOT).href;
    const actions = el('div', 'adm-actions');
    actions.append(save, link);
    form.append(availLabel, noteLabel, noticeLabel, actions);

    fetchStatus(true).then((d) => {
      if (!d) return;
      select.value = d.availability.state;
      note.value = d.availability.note || '';
      notice.value = d.notice ? d.notice.text : '';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      save.disabled = true;
      const login = readLogin();
      try {
        const res = await fetch(STATUS_API, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({
            action: 'set', token: login ? login.token : '',
            availability: select.value, note: note.value.trim(), notice: notice.value.trim(),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          sessionStorage.removeItem(STATUS_CACHE_KEY);
          showToast('Status saved.');
        } else {
          showToast(data.error || 'Status couldn\'t be saved.');
        }
      } catch (err) {
        showToast('Couldn\'t connect. Try again.');
      }
      save.disabled = false;
    });
    return section('Your status', form);
  }

  // Sends a test email to MAIL_TO; on failure shows the real reason from the mail server
  function emailSection() {
    const box = el('div', 'adm-status');
    const btn = el('button', 'shop-btn', 'Send test email');
    btn.type = 'button';
    btn.prepend(icon('fa-solid fa-envelope'));
    const result = el('div', 'adm-mail-result');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      result.replaceChildren(el('p', 'w-sub', 'Sending…'));
      const { ok, data } = await creditsCall('admin_mail_test');
      btn.disabled = false;
      if (ok) {
        result.replaceChildren(el('p', 'st-state st-state--ok', 'Sent. Check your Gmail (and the spam folder).'));
        return;
      }
      const err = el('pre', 'adm-mail-error', data.error || 'Unknown error');
      result.replaceChildren(el('p', 'st-state st-state--down', 'Email didn\'t send. Reason:'), err);
      if (data.settings) {
        const list = el('ul', 'wallet-list');
        Object.entries(data.settings).forEach(([k, v]) => {
          const li = el('li');
          li.append(el('span', null, k), el('span', 'w-amount', String(v)));
          list.append(li);
        });
        result.append(list);
      }
    });
    box.append(el('p', 'w-sub', 'Sends a test email to the order address in config.php.'), btn, result);
    return section('Email', box);
  }

  function pendingList(items) {
    if (!items.length) return el('p', null, 'Nothing to review right now.');
    const list = el('ul', 'wallet-list');
    items.forEach((r) => {
      const li = el('li');
      const main = el('div', 'w-main');
      main.append(
        el('span', 'w-amount', `${fmtCredits(r.amount)} CW Credits`),
        el('span', 'w-sub', `${r.u} · ${r.uid} · ${when(r.ts)}`),
      );
      if (r.note) main.append(el('span', 'w-note', `“${r.note}”`));

      const actions = el('div', 'adm-actions');
      const yes = el('button', 'shop-btn', 'Approve');
      yes.type = 'button';
      yes.prepend(icon('fa-solid fa-check'));
      yes.addEventListener('click', () => {
        if (window.confirm(`Add ${fmtCredits(r.amount)} CW Credits to ${r.u}?`)) {
          act(yes, 'admin_decide', { id: r.id, decision: 'approve' }, `${fmtCredits(r.amount)} CW Credits added to ${r.u}.`);
        }
      });
      const no = el('button', 'shop-btn shop-btn--ghost', 'Decline');
      no.type = 'button';
      no.prepend(icon('fa-solid fa-xmark'));
      no.addEventListener('click', () => {
        if (window.confirm(`Decline ${r.u}'s request for ${fmtCredits(r.amount)} CW Credits?`)) {
          act(no, 'admin_decide', { id: r.id, decision: 'reject' }, 'Request declined.');
        }
      });
      actions.append(yes, no);
      li.append(main, actions);
      list.append(li);
    });
    return list;
  }

  function balanceList(items) {
    if (!items.length) return el('p', null, 'Nobody has CW Credits yet.');
    const list = el('ul', 'wallet-list');
    items.forEach((b) => {
      const li = el('li');
      const main = el('div', 'w-main');
      main.append(el('span', null, b.u), el('span', 'w-sub', b.uid));

      const right = el('div', 'adm-adjust');
      right.append(el('span', 'w-amount', fmtCredits(b.bal)));
      const input = el('input');
      Object.assign(input, { type: 'number', step: '1', placeholder: '+/−', inputMode: 'numeric' });
      input.setAttribute('aria-label', `Change ${b.u}'s balance by`);
      const apply = el('button', 'shop-btn shop-btn--ghost', 'Apply');
      apply.type = 'button';
      apply.addEventListener('click', () => {
        const delta = Number(input.value);
        if (!Number.isInteger(delta) || delta === 0) {
          showToast('Enter a whole number, like 100 or -50.');
          return;
        }
        if (window.confirm(`${delta > 0 ? 'Add' : 'Remove'} ${fmtCredits(Math.abs(delta))} CW Credits ${delta > 0 ? 'to' : 'from'} ${b.u}?`)) {
          act(apply, 'admin_adjust', { uid: b.uid, delta }, 'Balance updated.');
        }
      });
      right.append(input, apply);
      li.append(main, right);
      list.append(li);
    });
    return list;
  }

  function subsList(items) {
    if (!items.length) return el('p', null, 'No subscriptions yet.');
    const list = el('ul', 'wallet-list');
    items.forEach((x) => {
      const li = el('li');
      const main = el('div', 'w-main');
      const info = {
        active: `Next payment ${when(x.next_due)}`,
        grace: `Payment due before ${when(x.grace_until)}`,
        cancelling: `Cancelled by user · ends ${when(x.next_due)}`,
        cancelled: `Ended ${x.ended ? when(x.ended) : ''}${x.reason === 'unpaid' ? ' (not paid)' : x.reason === 'admin' ? ' (by you)' : ''}`,
      }[x.status] || x.status;
      main.append(el('span', null, `${x.name} · ${x.u}`), el('span', 'w-sub', `${x.uid} · ${fmtCredits(x.price)} CW Credits / month · ${info}`));
      const chip = { active: ['approved', 'Active'], grace: ['pending', 'Payment due'], cancelling: ['pending', 'Ending'], cancelled: ['rejected', 'Ended'] }[x.status];
      const right = el('div', 'adm-actions');
      right.append(el('span', `w-status w-status--${chip ? chip[0] : 'pending'}`, chip ? chip[1] : x.status));
      if (x.status !== 'cancelled') {
        const stop = el('button', 'shop-btn shop-btn--ghost', 'Cancel');
        stop.type = 'button';
        stop.addEventListener('click', () => {
          if (window.confirm(`Cancel ${x.u}'s subscription to ${x.name} now?`)) {
            act(stop, 'admin_cancel_sub', { id: x.id }, 'Subscription cancelled.');
          }
        });
        const gift = el('button', 'shop-btn shop-btn--ghost', '+30 days free');
        gift.type = 'button';
        gift.addEventListener('click', () => {
          if (window.confirm(`Extend ${x.u}'s ${x.name} subscription by 30 days for free? No CW Credits are taken.`)) {
            act(gift, 'admin_extend_sub', { id: x.id }, 'Subscription extended by 30 days.');
          }
        });
        right.append(gift, stop);
      }
      li.append(main, right);
      list.append(li);
    });
    return list;
  }

  function licenseSection(data) {
    const box = el('div', 'adm-status');
    if (data.license_public_key) {
      const row = el('div', 'lic-row');
      const copy = el('button', 'shop-btn shop-btn--ghost', 'Copy');
      copy.type = 'button';
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(data.license_public_key); showToast('Public key copied.'); } catch (err) { showToast('Select the key and copy it.'); }
      });
      row.append(el('code', 'lic-key lic-key--long', data.license_public_key), copy);
      box.append(el('p', 'w-sub', 'License public key — paste it into PUBLIC_KEY_B64 in fizzy_license.py (only needed once):'), row);
    } else if (data.license_error) {
      box.append(el('pre', 'adm-mail-error', data.license_error));
    }
    const items = data.licenses || [];
    if (!items.length) {
      box.append(el('p', null, 'No licenses yet. They appear when someone subscribes to a product with "license": true.'));
      return section('Licenses', box);
    }
    const list = el('ul', 'wallet-list');
    items.forEach((l) => {
      const li = el('li');
      const main = el('div', 'w-main');
      main.append(el('span', null, `${l.product} · ${l.u}`), el('span', 'w-sub', `${l.key} · ${l.uid}`));
      main.append(el('span', 'w-sub', l.devices.length
        ? `Computers (${l.devices.length}/${data.max_devices || 2}): ` + l.devices.map((d) => `${d.name || 'Unknown'} (last used ${when(d.last)})`).join(', ')
        : 'Not used on any computer yet'));
      const right = el('div', 'adm-actions');
      if (l.devices.length) {
        const reset = el('button', 'shop-btn shop-btn--ghost', 'Reset computers');
        reset.type = 'button';
        reset.addEventListener('click', () => {
          if (window.confirm(`Remove all computers from ${l.u}'s license? They can then use it on new computers.`)) {
            act(reset, 'admin_reset_devices', { license: l.key }, 'Computers reset.');
          }
        });
        right.append(reset);
      }
      li.append(main, right);
      list.append(li);
    });
    box.append(list);
    return section('Licenses', box);
  }

  function chatThread(messages, mine, names) {
    const list = el('div', 'chat-list');
    messages.forEach((m) => {
      const b = el('div', `chat-msg ${m.who === mine ? 'is-me' : ''}`);
      b.append(el('span', 'chat-who', `${names[m.who] || m.who} · ${when(m.created)}`), el('span', null, m.text));
      list.append(b);
    });
    if (!messages.length) list.append(el('span', 'w-sub', 'No messages yet.'));
    return list;
  }

  function replyRow(label, onSend) {
    const row = el('div', 'chat-row');
    const input = el('textarea');
    Object.assign(input, { rows: 2, maxLength: 2000, placeholder: 'Write a reply…' });
    const btn = el('button', 'shop-btn', label);
    btn.type = 'button';
    btn.addEventListener('click', () => { if (input.value.trim()) onSend(btn, input.value.trim()); });
    row.append(input, btn);
    return row;
  }

  function adminChat(o) {
    const box = el('div', 'chat');
    box.append(chatThread(o.messages || [], 'owner', { customer: o.u, owner: 'You' }),
      replyRow('Send', (btn, text) => act(btn, 'admin_order_message', { order: o.id, text }, 'Message sent.')));
    return box;
  }

  // ---------- Support: questions from the Help page (Fizzy answers first)
  // ---------- Priority Listeners previews: upload once, every active subscriber can listen in their wallet
  function previewsAdmin() {
    const box = el('div', 'disc');
    box.append(el('p', 'w-sub', 'Loading…'));
    creditsCall('admin_previews').then(({ ok, data }) => {
      box.replaceChildren();
      if (!ok) return box.append(el('p', null, data.error || 'Previews couldn\'t be loaded.'));
      const subs = data.subscribers || [];
      box.append(el('p', 'w-sub', `${subs.length} active subscriber${subs.length === 1 ? '' : 's'}${subs.length ? `: ${subs.join(', ')}` : ''}. They can listen in their wallet; subscribers with a CW PLAY account also get an email.`));
      const card = el('div', 'pd-buybox disc-card');
      const title = el('input'); Object.assign(title, { maxLength: 120, placeholder: 'e.g. New track — 30 s preview' });
      const note = el('textarea'); Object.assign(note, { maxLength: 1000, rows: 2, placeholder: 'Note for listeners (optional): what to give feedback on…' });
      const file = el('input'); Object.assign(file, { type: 'file', accept: '.mp3,.wav,.ogg,.m4a' });
      const row = (label, input) => { const l = el('label', 'disc-row'); l.append(el('span', null, label), input); return l; };
      const send = el('button', 'shop-btn', 'Upload preview');
      send.type = 'button';
      send.addEventListener('click', async () => {
        const f = file.files[0];
        if (!title.value.trim()) return showToast('Give the preview a title.');
        if (!f) return showToast('Choose an audio file.');
        if (f.size > 5 * 1024 * 1024) return showToast('Previews can be up to 5 MB. Export a shorter clip or a lower bitrate mp3.');
        const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
        send.disabled = true;
        send.textContent = 'Uploading…';
        const r = await creditsCall('admin_preview_upload', { title: title.value.trim(), note: note.value.trim(), name: f.name, data: b64 });
        send.disabled = false;
        send.textContent = 'Upload preview';
        if (!r.ok) return showToast(r.data.error || 'Upload failed.');
        showToast(`Preview uploaded.${r.data.mailed ? ` ${r.data.mailed} subscriber${r.data.mailed === 1 ? '' : 's'} got an email.` : ''}`);
        render();
      });
      card.append(el('p', 'pd-price-label', 'New preview'), row('Title', title), row('Note', note), row('Audio file (mp3, wav, ogg, m4a · max 5 MB)', file), send);
      box.append(card);
      const list = data.previews || [];
      if (list.length) {
        const ul = el('ul', 'wallet-list');
        list.forEach((pv) => {
          const li = el('li');
          const main = el('div', 'w-main');
          main.append(el('span', null, pv.title), el('span', 'w-sub', `${when(pv.created)} · ${Math.max(1, Math.round(pv.size / 1024))} KB`));
          const rm = el('button', 'shop-btn shop-btn--ghost', 'Remove');
          rm.type = 'button';
          rm.addEventListener('click', () => {
            if (window.confirm(`Remove “${pv.title}”? Subscribers won't be able to listen to it anymore.`)) act(rm, 'admin_preview_remove', { id: pv.id }, 'Preview removed.');
          });
          li.append(main, rm);
          ul.append(li);
        });
        box.append(ul);
      }
    });
    return box;
  }

  // ---------- Blocked accounts and IP codes (manage them even if the Discord block link is gone)
  function bansSection() {
    const box = el('div', 'disc');
    const load = async () => {
      box.replaceChildren(el('p', 'w-sub', 'Loading…'));
      const r = await creditsCall('admin_bans');
      box.replaceChildren();
      if (!r.ok) return box.append(el('p', null, r.data.error || 'Blocks couldn\'t be loaded.'));
      const unblock = (btn, kind, code, label) => {
        if (!window.confirm(`Unblock ${label}? They'll be able to order and write reviews again.`)) return;
        btn.disabled = true;
        creditsCall('admin_unban', { kind, code }).then((x) => { showToast(x.ok ? 'Unblocked.' : (x.data.error || 'Failed.')); load(); });
      };
      const accounts = r.data.accounts || [];
      const ips = r.data.ips || [];
      box.append(el('p', 'w-sub', 'Blocked accounts and connections can\'t order, request CW Credits, write reviews or use Help. Blocks you make from the 🚫 links in Discord also show up here.'));
      box.append(el('p', 'pd-price-label', `Accounts (${accounts.length})`));
      if (!accounts.length) box.append(el('p', 'w-sub', 'No blocked accounts.'));
      const al = el('ul', 'wallet-list');
      accounts.forEach((a) => {
        const li = el('li');
        const main = el('div', 'w-main');
        main.append(el('span', null, `🚫 ${a.name || a.id}`), el('span', 'w-sub', `${a.type} · ${a.id}${a.ts ? ` · since ${when(a.ts)}` : ''}`));
        const b = el('button', 'shop-btn shop-btn--ghost', 'Unblock'); b.type = 'button';
        b.addEventListener('click', () => unblock(b, 'id', a.id, a.name || a.id));
        li.append(main, b);
        al.append(li);
      });
      box.append(al);
      box.append(el('p', 'pd-price-label', `IP codes (${ips.length})`));
      if (!ips.length) box.append(el('p', 'w-sub', 'No blocked IP codes.'));
      const il = el('ul', 'wallet-list');
      ips.forEach((x) => {
        const li = el('li');
        const main = el('div', 'w-main');
        main.append(el('span', null, `🚫 ${x.code}`), el('span', 'w-sub', `IP code${x.ts ? ` · since ${when(x.ts)}` : ''}`));
        const b = el('button', 'shop-btn shop-btn--ghost', 'Unblock'); b.type = 'button';
        b.addEventListener('click', () => unblock(b, 'ip', x.code, `IP code ${x.code}`));
        li.append(main, b);
        il.append(li);
      });
      box.append(il);
      // block by hand
      const card = el('div', 'pd-buybox disc-card');
      const kind = el('select', 'adm-select');
      [['id', 'Account (Discord ID or cw…)'], ['ip', 'IP code (12 characters)']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; kind.append(o); });
      const code = el('input'); Object.assign(code, { maxLength: 40, placeholder: 'e.g. 123456789012345678 or cw12' });
      kind.addEventListener('change', () => { code.placeholder = kind.value === 'ip' ? 'e.g. a1b2c3d4e5f6' : 'e.g. 123456789012345678 or cw12'; });
      const go = el('button', 'shop-btn', 'Block'); go.type = 'button';
      go.addEventListener('click', async () => {
        if (!code.value.trim()) return showToast('Enter an ID or IP code.');
        if (!window.confirm(`Block ${code.value.trim()}?`)) return;
        go.disabled = true;
        const x = await creditsCall('admin_ban', { kind: kind.value, code: code.value.trim() });
        go.disabled = false;
        showToast(x.ok ? 'Blocked.' : (x.data.error || 'Failed.'));
        if (x.ok) load();
      });
      const row = (l, i) => { const lab = el('label', 'disc-row'); lab.append(el('span', null, l), i); return lab; };
      card.append(el('p', 'pd-price-label', 'Block by hand'), row('Type', kind), row('ID or code', code), go);
      box.append(card);
    };
    load();
    return box;
  }

  // ---------- Campaigns: gift product, buy X pay Y, first month of a subscription (+ "notify me" requests)
  function campaignsSection() {
    const box = el('div', 'disc');
    box.append(el('p', 'w-sub', 'Loading…'));
    Promise.all([creditsCall('admin_campaigns'), loadCatalog().catch(() => [])]).then(([r, products]) => {
      box.replaceChildren();
      if (!r.ok) return box.append(el('p', null, r.data.error || 'Campaigns couldn\'t be loaded.'));
      const c = r.data.campaigns;
      const now = r.data.now;
      const toLocal = (ts) => { if (!ts) return ''; const t = new Date(ts * 1000); return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
      const fromLocal = (v) => (v ? Math.floor(new Date(v).getTime() / 1000) : 0);
      const row = (label, input, hint) => { const l = el('label', 'disc-row'); l.append(el('span', null, label), input); if (hint) l.append(el('small', 'w-sub', hint)); return l; };
      const onOff = (on) => { const sel = el('select', 'adm-select'); [['1', 'On (var)'], ['0', 'Off (yok)']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; sel.append(o); }); sel.value = on ? '1' : '0'; return sel; };
      const num = (v, min, max) => { const i = el('input'); Object.assign(i, { type: 'number', min, max, value: v }); return i; };
      const text = (v, ph) => { const i = el('input'); Object.assign(i, { maxLength: 140, value: v, placeholder: ph }); return i; };
      const date = (ts) => { const i = el('input'); i.type = 'datetime-local'; i.value = toLocal(ts); return i; };
      const pick = (list, value, empty) => {
        const sel = el('select', 'adm-select');
        const o0 = el('option', null, empty); o0.value = ''; sel.append(o0);
        list.forEach((p) => { const o = el('option', null, p.name); o.value = p.key; sel.append(o); });
        sel.value = value || '';
        return sel;
      };
      const ticks = (list, chosen) => {
        const box2 = el('div', 'disc-picks');
        list.forEach((p) => { const l = el('label'); const cb = el('input'); cb.type = 'checkbox'; cb.value = p.key; cb.checked = chosen.includes(p.key); l.append(cb, document.createTextNode(` ${p.name}`)); box2.append(l); });
        return box2;
      };
      const ticked = (b) => [...b.querySelectorAll('input:checked')].map((x) => x.value);
      const stateOf = (x) => (!x.on ? 'Now: off.' : x.start && now < x.start ? 'Now: scheduled, starts automatically.' : x.end && now >= x.end ? 'Now: ended (the end date has passed).' : 'Now: active on the store.');
      const items = products.filter((p) => creditPrice(p) && !p.subscription);
      const subs = products.filter((p) => creditPrice(p) && p.subscription);

      // 1) gift product
      const g = el('div', 'pd-buybox disc-card');
      const gOn = onOff(c.gift.on); const gBuy = pick(items, c.gift.buy, 'Choose the product to buy…'); const gGift = pick(items, c.gift.gift, 'Choose the gift…');
      const gMsg = text(c.gift.message, 'e.g. Buy an avatar, get a phone wallpaper free! 🎁'); const gS = date(c.gift.start); const gE = date(c.gift.end);
      g.append(el('p', 'pd-price-label', '🎁 Gift product'), el('p', 'w-sub', stateOf(c.gift)),
        row('Status', gOn), row('When someone buys', gBuy), row('They also get, free', gGift, 'Added to their order for 0 CW Credits; deliver it like any order.'),
        row('Message', gMsg, 'Shown on the store and the product page.'), row('Starts (optional)', gS), row('Ends (optional)', gE));

      // 2) buy X pay Y
      const m = el('div', 'pd-buybox disc-card');
      const mOn = onOff(c.multi.on); const mBuy = num(c.multi.buy, 2, 10); const mPay = num(c.multi.pay, 1, 9);
      const mScope = el('select', 'adm-select');
      [['all', 'All products sold for CW Credits'], ['selected', 'Only the products I tick']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; mScope.append(o); });
      mScope.value = c.multi.scope;
      const mPicks = ticks(items, c.multi.products);
      const syncM = () => { mPicks.style.display = mScope.value === 'selected' ? '' : 'none'; };
      mScope.addEventListener('change', syncM); syncM();
      const mMsg = text(c.multi.message, 'e.g. Buy 3 wallpapers, pay for 2!'); const mS = date(c.multi.start); const mE = date(c.multi.end);
      m.append(el('p', 'pd-price-label', '🛍️ Buy X, pay Y'), el('p', 'w-sub', stateOf(c.multi)),
        row('Status', mOn), row('Buy (X)', mBuy), row('Pay for (Y)', mPay, 'The cheapest ones are free. Doesn\'t add up with discounts: the cheaper total applies.'),
        row('Applies to', mScope), mPicks, row('Message', mMsg), row('Starts (optional)', mS), row('Ends (optional)', mE));

      // 3) first month of a subscription
      const t = el('div', 'pd-buybox disc-card');
      const tOn = onOff(c.trial.on);
      const tMode = el('select', 'adm-select');
      [['free', 'First month free'], ['percent', 'First month with a discount']].forEach(([v, x]) => { const o = el('option', null, x); o.value = v; tMode.append(o); });
      tMode.value = c.trial.mode;
      const tPct = num(c.trial.percent, 1, 90); const tPicks = ticks(subs, c.trial.products);
      const tMsg = text(c.trial.message, 'e.g. Try Priority Listeners free for a month!'); const tS = date(c.trial.start); const tE = date(c.trial.end);
      const tPctRow = row('Discount percent', tPct);
      const syncT = () => { tPctRow.style.display = tMode.value === 'percent' ? '' : 'none'; };
      tMode.addEventListener('change', syncT); syncT();
      t.append(el('p', 'pd-price-label', '🔁 Subscription: first month'), el('p', 'w-sub', stateOf(c.trial)),
        el('p', 'w-sub', 'Only for people who never subscribed to that product before. Later months cost the normal price.'),
        row('Status', tOn), row('Offer', tMode), tPctRow, el('span', 'w-sub', 'Subscriptions:'), tPicks,
        row('Message', tMsg), row('Starts (optional)', tS), row('Ends (optional)', tE));

      const save = el('button', 'shop-btn', 'Save campaigns');
      save.type = 'button';
      save.addEventListener('click', () => {
        const bad = [[gS, gE], [mS, mE], [tS, tE]].some(([a, b]) => fromLocal(a.value) && fromLocal(b.value) && fromLocal(b.value) <= fromLocal(a.value));
        if (bad) return showToast('An end date must be after its start.');
        if (gOn.value === '1' && (!gBuy.value || !gGift.value)) return showToast('Choose both products for the gift campaign.');
        if (Number(mPay.value) >= Number(mBuy.value)) return showToast('"Pay for" must be less than "Buy".');
        act(save, 'admin_campaigns_save', { campaigns: {
          gift: { on: gOn.value === '1', buy: gBuy.value, gift: gGift.value, message: gMsg.value.trim(), start: fromLocal(gS.value), end: fromLocal(gE.value) },
          multi: { on: mOn.value === '1', buy: Number(mBuy.value), pay: Number(mPay.value), scope: mScope.value, products: ticked(mPicks), message: mMsg.value.trim(), start: fromLocal(mS.value), end: fromLocal(mE.value) },
          trial: { on: tOn.value === '1', mode: tMode.value, percent: Number(tPct.value), products: ticked(tPicks), message: tMsg.value.trim(), start: fromLocal(tS.value), end: fromLocal(tE.value) },
        } }, 'Campaigns saved.');
      });
      const grid = el('div', 'disc-grid');
      grid.append(g, m, t);
      // "notify me" requests waiting for full products
      const waiting = Object.entries(r.data.notify || {});
      const nBox = el('div', 'pd-buybox disc-card');
      nBox.append(el('p', 'pd-price-label', '🔔 "Notify me" requests'),
        el('p', 'w-sub', waiting.length ? waiting.map(([k, n]) => `${(products.find((p) => p.key === k) || {}).name || k}: ${n} waiting`).join(' · ')
          : 'No one is waiting. When a full product opens again (in catalog.json), everyone waiting gets an email within about 10 minutes.'));
      if (waiting.length) {
        const now2 = el('button', 'shop-btn shop-btn--ghost', 'Check now');
        now2.type = 'button';
        now2.addEventListener('click', async () => { const x = await creditsCall('admin_notify_check'); showToast(x.ok ? `${x.data.sent} email${x.data.sent === 1 ? '' : 's'} sent.` : x.data.error); });
        nBox.append(now2);
      }
      box.append(grid, save, nBox);
    });
    return box;
  }

  // ---------- Discounts (no coupons): store sale for special days, first purchase, cart bundle
  function discountsSection() {
    const box = el('div', 'disc');
    box.append(el('p', 'w-sub', 'Loading…'));
    Promise.all([creditsCall('admin_discounts'), loadCatalog().catch(() => [])]).then(([r, products]) => {
      box.replaceChildren();
      if (!r.ok) return box.append(el('p', null, r.data.error || 'Discounts couldn\'t be loaded.'));
      const d = r.data.discounts;
      const toLocal = (ts) => {
        if (!ts) return '';
        const t = new Date(ts * 1000);
        return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      };
      const fromLocal = (v) => (v ? Math.floor(new Date(v).getTime() / 1000) : 0);
      const row = (label, input, hint) => {
        const l = el('label', 'disc-row');
        l.append(el('span', null, label), input);
        if (hint) l.append(el('small', 'w-sub', hint));
        return l;
      };
      const onOff = (on) => {
        const sel = el('select', 'adm-select');
        [['1', 'On (var)'], ['0', 'Off (yok)']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; sel.append(o); });
        sel.value = on ? '1' : '0';
        return sel;
      };
      const num = (v, min, max) => { const i = el('input'); Object.assign(i, { type: 'number', min, max, value: v }); return i; };

      // Store sale
      const sale = el('div', 'pd-buybox disc-card');
      const sOn = onOff(d.sale.on);
      const sPct = num(d.sale.percent, 1, 90);
      const sMsg = el('input'); Object.assign(sMsg, { maxLength: 140, value: d.sale.message, placeholder: 'e.g. Happy New Year! 🎉' });
      const sScope = el('select', 'adm-select');
      [['all', 'All products sold for CW Credits'], ['selected', 'Only the products I tick']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; sScope.append(o); });
      sScope.value = d.sale.scope;
      const picks = el('div', 'disc-picks');
      products.filter((p) => creditPrice(p) && !p.subscription).forEach((p) => {
        const l = el('label');
        const c = el('input'); c.type = 'checkbox'; c.value = p.key; c.checked = d.sale.products.includes(p.key);
        l.append(c, document.createTextNode(` ${p.name}`));
        picks.append(l);
      });
      const syncPicks = () => { picks.style.display = sScope.value === 'selected' ? '' : 'none'; }; // (the CSS grid would override `hidden`)
      sScope.addEventListener('change', syncPicks);
      syncPicks();
      const sStart = el('input'); sStart.type = 'datetime-local'; sStart.value = toLocal(d.sale.start);
      const sEnd = el('input'); sEnd.type = 'datetime-local'; sEnd.value = toLocal(d.sale.end);
      const presets = el('div', 'disc-presets');
      const now = new Date();
      const next = (m, day, h = 0) => { const t = new Date(now.getFullYear(), m, day, h); if (t < now - 86400000) t.setFullYear(t.getFullYear() + 1); return t; };
      const blackFriday = () => {
        let y = now.getFullYear();
        const fri = (yy) => { const t = new Date(yy, 10, 30); while (t.getDay() !== 5) t.setDate(t.getDate() - 1); return t; };
        let f = fri(y);
        if (f.getTime() + 4 * 86400000 < now.getTime()) f = fri(++y);
        return f;
      };
      const fmt = (t) => new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      [
        ['🎉 New Year', 'Happy New Year! 🎉', () => next(11, 31), (a) => new Date(a.getTime() + 2 * 86400000)],
        ['💜 Valentine\'s Day', 'Happy Valentine\'s Day! 💜', () => next(1, 14), (a) => new Date(a.getTime() + 86400000)],
        ['🖤 Black Friday', 'Black Friday sale! 🖤', blackFriday, (a) => new Date(a.getTime() + 4 * 86400000)],
        ['🎂 CW PLAY birthday', 'It\'s CW PLAY\'s birthday! 🎂', null, null],
      ].forEach(([label, msg, start, end]) => {
        const b = el('button', 'shop-btn shop-btn--ghost', label);
        b.type = 'button';
        b.addEventListener('click', () => {
          sMsg.value = msg;
          sOn.value = '1';
          if (start) { const a = start(); sStart.value = fmt(a); sEnd.value = fmt(end(a)); } else { sStart.value = ''; sEnd.value = ''; }
          showToast(start ? 'Filled in. Check the dates and percent, then Save.' : 'Filled in. Set the dates for your birthday sale, then Save.');
        });
        presets.append(b);
      });
      const state = el('p', 'w-sub');
      const ts = r.data.now;
      if (!d.sale.on) state.textContent = 'Now: off.';
      else if (d.sale.start && ts < d.sale.start) state.textContent = 'Now: scheduled, starts automatically.';
      else if (d.sale.end && ts >= d.sale.end) state.textContent = 'Now: ended (the end date has passed).';
      else state.textContent = 'Now: active on the store.';
      sale.append(el('p', 'pd-price-label', 'Store sale (special days)'), state, el('span', 'w-sub', 'Quick fill:'), presets,
        row('Discount status', sOn), row('Discount percent', sPct, '1–90%'), row('Discount message', sMsg, 'Shown at the top of the store and on discounted products.'),
        row('Applies to', sScope), picks,
        row('Starts (optional)', sStart, 'Leave empty to start right away.'), row('Ends (optional)', sEnd, 'Leave empty to keep it on until you turn it off.'));

      // First purchase + cart bundle
      const first = el('div', 'pd-buybox disc-card');
      const fOn = onOff(d.first.on); const fPct = num(d.first.percent, 1, 90);
      first.append(el('p', 'pd-price-label', 'First purchase'), el('p', 'w-sub', 'For customers who never bought anything with CW Credits.'),
        row('Status', fOn), row('Discount percent', fPct));
      const bundle = el('div', 'pd-buybox disc-card');
      const bOn = onOff(d.bundle.on); const bMin = num(d.bundle.min, 2, 20); const bPct = num(d.bundle.percent, 1, 90);
      bundle.append(el('p', 'pd-price-label', 'Cart bundle'), el('p', 'w-sub', 'When the cart has at least this many products.'),
        row('Status', bOn), row('Minimum products', bMin), row('Discount percent', bPct));

      const save = el('button', 'shop-btn', 'Save discounts');
      save.type = 'button';
      save.addEventListener('click', () => {
        const startTs = fromLocal(sStart.value); const endTs = fromLocal(sEnd.value);
        if (startTs && endTs && endTs <= startTs) return showToast('The end must be after the start.');
        act(save, 'admin_discounts_save', { discounts: {
          sale: { on: sOn.value === '1', percent: Number(sPct.value), message: sMsg.value.trim(), scope: sScope.value,
            products: [...picks.querySelectorAll('input:checked')].map((c) => c.value), start: startTs, end: endTs },
          first: { on: fOn.value === '1', percent: Number(fPct.value) },
          bundle: { on: bOn.value === '1', min: Number(bMin.value), percent: Number(bPct.value) },
        } }, 'Discounts saved.');
      });
      const grid = el('div', 'disc-grid');
      grid.append(sale, el('div', 'disc-side'));
      grid.lastChild.append(first, bundle);
      box.append(grid, el('p', 'w-sub', 'Discounts don\'t add up: the biggest one applies. Subscriptions are never discounted. Prices are always calculated by the server.'), save);
    });
    return box;
  }

  // Support: questions from the Help page (Fizzy answers first). Refreshes by itself every 5 seconds;
  // replies you're typing are kept.
  const supportBox = el('div');
  const supportDrafts = {};
  let supportSig = '';
  let supportTimer = null;

  function drawSupport(list) {
    const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.ticket : null;
    supportBox.replaceChildren();
    if (!list.length) return supportBox.append(el('p', null, 'No questions right now.'));
    const ul = el('ul', 'wallet-list');
    list.forEach((t) => {
      const li = el('li', 'ord');
      const main = el('div', 'w-main');
      main.append(el('span', 'w-amount', `#${t.id} · ${t.u}${t.human ? ' · needs you' : ''}`), el('span', 'w-sub', `${t.uid} · ${t.status} · ${when(t.updated)}`));
      const chat = el('div', 'chat');
      const thread = chatThread(t.messages, 'owner', { user: t.u, fizzy: 'Fizzy', owner: 'You' });
      chat.append(thread);
      if (t.status !== 'closed') {
        const row = replyRow('Reply', async (btn, text) => {
          btn.disabled = true;
          const r = await supportCall('admin_reply', { ticket: t.id, text });
          showToast(r.ok ? 'Reply sent.' : (r.data.error || 'Couldn\'t send.'));
          btn.disabled = false;
          if (r.ok) {
            delete supportDrafts[t.id];
            loadSupport(true);
          }
        });
        const ta = row.querySelector('textarea');
        ta.dataset.ticket = String(t.id);
        ta.value = supportDrafts[t.id] || '';
        ta.addEventListener('input', () => { supportDrafts[t.id] = ta.value; });
        chat.append(row);
        if (focused === String(t.id)) setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
      }
      main.append(chat);
      const right = el('div', 'adm-actions');
      if (t.status !== 'closed') {
        const close = el('button', 'shop-btn shop-btn--ghost', 'Close');
        close.type = 'button';
        close.addEventListener('click', async () => {
          const r = await supportCall('admin_close', { ticket: t.id });
          showToast(r.ok ? 'Closed.' : 'Couldn\'t close.');
          if (r.ok) loadSupport(true);
        });
        right.append(close);
      }
      li.append(main, right);
      ul.append(li);
      setTimeout(() => { thread.scrollTop = thread.scrollHeight; });
    });
    supportBox.append(ul);
  }

  async function loadSupport(force = false) {
    if (!supportBox.isConnected && !force) return;
    const { ok, data } = await supportCall('admin_tickets');
    if (!ok) {
      supportBox.replaceChildren(el('p', null, data.error || 'Support couldn\'t be loaded.'));
      return;
    }
    const list = data.tickets || [];
    const sig = JSON.stringify(list.map((t) => [t.id, t.status, t.human, t.messages.length, (t.messages.at(-1) || {}).created]));
    if (force || sig !== supportSig) {
      if (!force && supportSig && list.some((t) => t.messages.length)) showToast('New support message.');
      supportSig = sig;
      drawSupport(list);
    }
  }

  function supportSection() {
    supportSig = '';
    supportBox.replaceChildren(el('p', 'w-sub', 'Loading…'));
    loadSupport(true);
    if (!supportTimer) {
      supportTimer = setInterval(() => { if (!document.hidden) loadSupport(); }, 5000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) loadSupport(); });
    }
    return supportBox;
  }

  // ---------- Orders (tracking + delivery) and reviews waiting for approval
  function ordersSection() {
    const box = el('div');
    box.append(el('p', 'w-sub', 'Loading orders…'));
    creditsCall('admin_orders').then(({ ok, data }) => {
      box.replaceChildren();
      if (!ok) {
        box.append(el('p', null, data.error || 'Orders couldn\'t be loaded.'));
        return;
      }
      const list = data.orders || [];
      if (!list.length) {
        box.append(el('p', null, 'No orders yet.'));
        return;
      }
      const ul = el('ul', 'wallet-list');
      list.forEach((o) => {
        const li = el('li', 'ord');
        const main = el('div', 'w-main');
        const names = o.items.map((i) => i.name + (i.price ? ` (${fmtCredits(i.price)})` : '')).join(', ');
        main.append(el('span', 'w-amount', `#${o.id} · ${names}`),
          el('span', 'w-sub', `${o.u} · ${o.uid} · ${o.kind} · ${when(o.created)}${o.note ? ` · “${o.note}”` : ''}`));
        // files already delivered
        (o.files || []).forEach((f) => {
          const row = el('div', 'lic-row');
          const rm = el('button', 'shop-btn shop-btn--ghost', 'Remove');
          rm.type = 'button';
          rm.addEventListener('click', () => {
            if (window.confirm(`Remove ${f.name} from order #${o.id}?`)) act(rm, 'admin_file_remove', { id: f.id }, 'File removed.');
          });
          row.append(el('span', 'w-sub', `📎 ${f.name} (${Math.max(1, Math.round(f.size / 1024))} KB)`), rm);
          main.append(row);
        });
        // CW PLAY Cinema: screening details + chat
        if (o.cinema) {
          const sc = o.screening || {};
          const form = el('div', 'cin-box');
          form.append(el('span', 'cin-title', '🎬 Screening details (the customer gets an email)'));
          const fWhen = el('input'); Object.assign(fWhen, { value: sc.when || '', placeholder: 'When, e.g. 25 Oct 2026, 21:00', maxLength: 80 });
          const fLink = el('input'); Object.assign(fLink, { value: sc.link || '', placeholder: 'https://… (watch link or ticket page)', maxLength: 500 });
          const fNote = el('textarea'); Object.assign(fNote, { value: sc.note || '', placeholder: 'Note for the customer (ticket code, instructions…)', rows: 2, maxLength: 1000 });
          const save = el('button', 'shop-btn', 'Save screening');
          save.type = 'button';
          save.addEventListener('click', () => act(save, 'admin_screening', { order: o.id, when: fWhen.value.trim(), link: fLink.value.trim(), note: fNote.value.trim() }, 'Screening saved.'));
          form.append(fWhen, fLink, fNote, save);
          main.append(form, adminChat(o));
        }
        // deliver a file (up to 5 MB)
        const up = el('input');
        up.type = 'file';
        up.accept = '.png,.jpg,.jpeg,.webp,.gif,.pdf,.zip,.txt,.srt,.mp3,.wav';
        up.className = 'adm-file';
        up.addEventListener('change', async () => {
          const file = up.files[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            up.value = '';
            return showToast('Files can be up to 5 MB. For bigger files, send a link in a message.');
          }
          const b64 = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result).split(',')[1]);
            r.onerror = rej;
            r.readAsDataURL(file);
          });
          up.disabled = true;
          const { ok: good, data: res } = await creditsCall('admin_upload', { order: o.id, name: file.name, data: b64 });
          showToast(good ? `${file.name} added to order #${o.id}.` : (res.error || 'Upload failed.'));
          if (good) render(); else { up.disabled = false; up.value = ''; }
        });
        const upRow = el('label', 'w-sub adm-upload');
        upRow.append('Deliver a file (max 5 MB): ', up);
        main.append(upRow);
        // status
        const right = el('div', 'adm-actions');
        const sel = el('select', 'adm-select');
        Object.entries(data.statuses).forEach(([k, label]) => {
          const opt = el('option', null, label);
          opt.value = k;
          if (k === o.status) opt.selected = true;
          sel.append(opt);
        });
        sel.addEventListener('change', () => {
          const label = data.statuses[sel.value];
          const extra = sel.value === 'cancelled' && ['credits', 'cart'].includes(o.kind) ? ' Its CW Credits will be refunded.' : '';
          if (window.confirm(`Set order #${o.id} to “${label}”?${extra}`)) {
            act(sel, 'admin_order_status', { id: o.id, status: sel.value }, `Order #${o.id}: ${label}.`);
          } else {
            sel.value = o.status;
          }
        });
        right.append(sel);
        li.append(main, right);
        ul.append(li);
      });
      box.append(ul);
      // reviews waiting
      reviewsBox.replaceChildren();
      const rv = data.reviews || [];
      if (!rv.length) {
        reviewsBox.append(el('p', null, 'No reviews waiting.'));
      } else {
        const rl = el('ul', 'wallet-list');
        rv.forEach((r) => {
          const li = el('li');
          const main = el('div', 'w-main');
          main.append(el('span', null, `${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}  ${r.product} · ${r.u}`),
            el('span', 'w-sub', `Order #${r.order_id} · ${when(r.created)}`));
          if (r.text) main.append(el('span', 'w-note', `“${r.text}”`));
          const right = el('div', 'adm-actions');
          const yes = el('button', 'shop-btn', 'Publish');
          const no = el('button', 'shop-btn shop-btn--ghost', 'Decline');
          yes.type = no.type = 'button';
          yes.addEventListener('click', () => act(yes, 'admin_review', { id: r.id, decision: 'approve' }, 'Review published.'));
          no.addEventListener('click', () => act(no, 'admin_review', { id: r.id, decision: 'reject' }, 'Review declined.'));
          right.append(yes, no);
          li.append(main, right);
          rl.append(li);
        });
        reviewsBox.append(rl);
      }
    });
    return box;
  }
  const reviewsBox = el('div');

  function decidedList(items) {
    if (!items.length) return el('p', null, 'No decisions yet.');
    const list = el('ul', 'wallet-list');
    items.forEach((r) => {
      const li = el('li');
      const main = el('div', 'w-main');
      main.append(el('span', 'w-amount', `${fmtCredits(r.amount)} CW Credits · ${r.u}`),
        el('span', 'w-sub', `Asked ${when(r.ts)}${r.decided ? ` · decided ${when(r.decided)}` : ''}`));
      li.append(main, el('span', `w-status w-status--${r.status}`, r.status === 'approved' ? 'Approved' : 'Declined'));
      list.append(li);
    });
    return list;
  }

  function ledgerList(items) {
    if (!items.length) return el('p', null, 'No activity yet.');
    const list = el('ul', 'wallet-list');
    items.forEach((h) => {
      const li = el('li');
      const main = el('div', 'w-main');
      main.append(el('span', null, `${h.u} · ${h.reason}`), el('span', 'w-sub', `${when(h.ts)} · Balance after: ${fmtCredits(h.bal)}`));
      li.append(main, el('span', `w-amount ${h.delta > 0 ? 'w-plus' : 'w-minus'}`, `${h.delta > 0 ? '+' : '−'}${fmtCredits(Math.abs(h.delta))}`));
      list.append(li);
    });
    return list;
  }

  async function render() {
    root.replaceChildren(header(null));
    if (!readLogin()) {
      const box = el('div', 'pd-buybox wallet-login');
      box.append(el('p', 'pd-price', 'Log in as the store owner'), loginLink());
      root.append(box);
      return;
    }
    const loading = el('p', 'catalog-empty', 'Loading…');
    root.append(loading);
    const { ok, status, data } = await creditsCall('admin_list');
    loading.remove();
    if (!ok) {
      if (data.login) {
        render();
      } else {
        root.append(el('p', 'catalog-empty', status === 403
          ? 'This page is only for the store owner.' : (data.error || 'Couldn\'t load. Try again later.')));
        if (data.detail) {
          // Only sent to the owner: the real reason and how to fix it
          const why = el('div', 'pd-buybox adm-detail');
          why.append(el('p', 'pd-price-label', 'Sebep'), el('p', null, data.detail));
          root.append(why);
        }
      }
      return;
    }
    let statusPart;
    try {
      statusPart = statusSection();
    } catch (err) {
      statusPart = section('Your status', el('p', null, 'Status settings couldn\'t load. Refresh the page to try again.'));
    }
    root.replaceChildren(
      header(data.pending.length),
      statusPart,
      emailSection(),
      section('Waiting for approval', pendingList(data.pending)),
      section('Support', supportSection()),
      section('Discounts', discountsSection()),
      section('Campaigns', campaignsSection()),
      section('Blocked accounts', bansSection()),
      section('Priority Listeners previews', previewsAdmin()),
      section('Orders', ordersSection()),
      section('Reviews waiting', reviewsBox),
      section('Balances', balanceList(data.balances)),
      section('Subscriptions', subsList(data.subs || [])),
      licenseSection(data),
      section('Recent decisions', decidedList(data.decided)),
      section('Activity', ledgerList(data.ledger)),
    );
  }

  render();
})();
