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
        right.append(stop);
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
      section('Balances', balanceList(data.balances)),
      section('Subscriptions', subsList(data.subs || [])),
      licenseSection(data),
      section('Recent decisions', decidedList(data.decided)),
      section('Activity', ledgerList(data.ledger)),
    );
  }

  render();
})();
