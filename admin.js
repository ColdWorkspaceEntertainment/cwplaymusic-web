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
    root.replaceChildren(
      header(data.pending.length),
      section('Waiting for approval', pendingList(data.pending)),
      section('Balances', balanceList(data.balances)),
      section('Recent decisions', decidedList(data.decided)),
      section('Activity', ledgerList(data.ledger)),
    );
  }

  render();
})();
