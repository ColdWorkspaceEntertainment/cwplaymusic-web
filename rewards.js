// Rewards: CW Points. Daily reward + streak, credit packs bought with points (no real money), redeem codes.
(() => {
  const root = document.getElementById('rewardsPage');
  if (!root) return;
  const when = (ts) => new Date(ts * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const pts = (n) => Number(n).toLocaleString('en-US');
  let state = null;
  let tick = null;

  function header() {
    const head = el('header', 'shop-head');
    const t = el('div');
    t.append(el('span', 'shop-kicker', 'CW Points'), el('h2', null, 'Rewards'),
      el('p', null, 'Collect CW Points every day, then use them to get CW Credits. No real money involved. You can still request CW Credits in your wallet too.'));
    head.append(t);
    return head;
  }

  const left = (ts) => {
    const s = Math.max(0, ts - Math.floor(Date.now() / 1000));
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const x = s % 60;
    return `${h}h ${String(m).padStart(2, '0')}m ${String(x).padStart(2, '0')}s`;
  };

  function draw() {
    clearInterval(tick);
    const d = state;
    const wrap = el('div', 'rw');

    // balance + daily reward
    const top = el('div', 'rw-top');
    const bal = el('div', 'pd-buybox rw-bal');
    bal.append(el('p', 'pd-price-label', 'Your CW Points'), el('p', 'rw-big', `🪙 ${pts(d.points)}`),
      el('p', 'w-sub', `You can spend ${pts(d.week_left)} more on packs this week (up to ${pts(d.week_cap)} every 7 days).`));
    const daily = el('div', 'pd-buybox rw-daily');
    daily.append(el('p', 'pd-price-label', 'Daily reward'));
    const dots = el('div', 'rw-streak');
    for (let i = 1; i <= d.streak_days; i += 1) {
      const dayInCycle = d.streak % d.streak_days || (d.streak ? d.streak_days : 0);
      const dot = el('span', `rw-dot${i <= dayInCycle ? ' is-done' : ''}${i === d.streak_days ? ' is-bonus' : ''}`, i === d.streak_days ? '🎁' : String(i));
      dots.append(dot);
    }
    daily.append(dots, el('p', 'w-sub', `${d.daily} points every 24 hours. Come ${d.streak_days} days in a row for +${d.streak_bonus} bonus points.${d.streak ? ` Your streak: ${d.streak} day${d.streak === 1 ? '' : 's'}.` : ''}`));
    const claim = el('button', 'shop-btn', 'Collect');
    claim.type = 'button';
    claim.prepend(icon('fa-solid fa-coins'));
    const now = Math.floor(Date.now() / 1000);
    if (d.blocked) {
      claim.disabled = true;
      daily.append(claim, el('p', 'cc-banner', d.blocked));
    } else if (d.next_claim > now) {
      claim.disabled = true;
      claim.textContent = `Next reward in ${left(d.next_claim)}`;
      tick = setInterval(() => {
        if (Math.floor(Date.now() / 1000) >= d.next_claim) { load(); return; }
        claim.textContent = `Next reward in ${left(d.next_claim)}`;
      }, 1000);
      daily.append(claim);
    } else {
      claim.addEventListener('click', async () => {
        claim.disabled = true;
        const r = await creditsCall('points_claim');
        if (!r.ok) { claim.disabled = false; return showToast(r.data.error); }
        showToast(r.data.bonus ? `+${r.data.got} CW Points, including a ${r.data.bonus}-point streak bonus! 🎉` : `+${r.data.got} CW Points!`);
        load();
      });
      daily.append(claim);
    }
    top.append(bal, daily);

    // packs
    const packsBox = el('section', 'pd-section');
    packsBox.append(el('h2', null, 'Get CW Credits'), el('p', 'w-sub', 'Pick a pack and pay with CW Points. The CW Credits go straight to your wallet.'));
    const grid = el('div', 'rw-packs');
    d.packs.forEach((p) => {
      const card = el('div', `pd-buybox rw-pack${p.bonus ? ' has-bonus' : ''}`);
      if (p.bonus) card.append(el('span', 'rw-ribbon', `+${p.bonus}% bonus`));
      card.append(el('p', 'pd-price-label', p.name), el('p', 'rw-big', `${fmtCredits(p.credits)}`), el('p', 'w-sub', 'CW Credits'));
      const buy = el('button', 'shop-btn', `${pts(p.points)} CW Points`);
      buy.type = 'button';
      buy.prepend(icon('fa-solid fa-coins'));
      const enough = d.points >= p.points && d.week_left >= p.points && !d.blocked;
      if (!enough) buy.disabled = true;
      buy.addEventListener('click', () => checkout(p));
      card.append(buy);
      if (!enough && !d.blocked) card.append(el('small', 'w-sub', d.points < p.points ? `${pts(p.points - d.points)} more points needed` : 'Weekly limit reached'));
      grid.append(card);
    });
    packsBox.append(grid);

    // redeem code
    const codeBox = el('section', 'pd-section');
    const form = el('form', 'rw-code');
    const input = el('input');
    Object.assign(input, { maxLength: 30, placeholder: 'Enter a code', autocomplete: 'off', spellcheck: false });
    const go = el('button', 'shop-btn', 'Redeem');
    go.type = 'submit';
    form.append(input, go);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      go.disabled = true;
      const r = await creditsCall('points_redeem', { code: input.value.trim() });
      go.disabled = false;
      if (!r.ok) return showToast(r.data.error);
      showToast(`Code ${r.data.code}: +${pts(r.data.got)} CW Points! 🎉`);
      load();
    });
    codeBox.append(el('h2', null, 'Redeem a code'), el('p', 'w-sub', 'Cold Works Production sometimes shares codes in announcements. Each code can be used once per account.'), form);

    // history
    const histBox = el('section', 'pd-section');
    histBox.append(el('h2', null, 'History'));
    const hist = d.history || [];
    if (!hist.length) histBox.append(el('p', 'w-sub', 'Nothing yet. Collect your first daily reward!'));
    const ul = el('ul', 'wallet-list');
    hist.forEach((h) => {
      const li = el('li');
      const main = el('div', 'w-main');
      const label = { daily: '🪙 Daily reward', pack: `🛍️ ${h.note}`, code: `🎟️ ${h.note}` }[h.type] || h.type;
      main.append(el('span', null, label), el('span', 'w-sub', `${when(h.t)}${h.type === 'daily' && h.note ? ` · ${h.note}` : ''}${h.receipt ? ` · receipt ${h.receipt}` : ''}`));
      const amt = el('span', `w-amount ${h.points < 0 ? 'is-neg' : 'is-pos'}`, `${h.points > 0 ? '+' : ''}${pts(h.points)} pts${h.credits ? ` → +${fmtCredits(h.credits)} credits` : ''}`);
      li.append(main, amt);
      ul.append(li);
    });
    histBox.append(ul);

    wrap.append(top, packsBox, codeBox, histBox);
    root.replaceChildren(header(), wrap);
  }

  // a checkout-style confirmation and a receipt (no real money)
  function checkout(p) {
    const back = el('div', 'rw-modal');
    const box = el('div', 'pd-buybox rw-modal-box');
    box.append(el('p', 'pd-price-label', 'Confirm'), el('h3', null, p.name),
      el('p', null, `You pay: 🪙 ${pts(p.points)} CW Points`), el('p', null, `You get: ${fmtCredits(p.credits)} CW Credits${p.bonus ? ` (includes +${p.bonus}% bonus)` : ''}`),
      el('p', 'w-sub', `CW Points left after: ${pts(state.points - p.points)}. No real money is used.`));
    const row = el('div', 'adm-actions');
    const ok = el('button', 'shop-btn', 'Confirm');
    ok.type = 'button';
    const cancel = el('button', 'shop-btn shop-btn--ghost', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => back.remove());
    ok.addEventListener('click', async () => {
      ok.disabled = true;
      const r = await creditsCall('points_buy', { pack: p.id });
      if (!r.ok) { back.remove(); return showToast(r.data.error); }
      box.replaceChildren(el('p', 'pd-price-label', 'Done ✅'), el('h3', null, `+${fmtCredits(p.credits)} CW Credits`),
        el('p', null, `Receipt: ${r.data.receipt}`), el('p', 'w-sub', `New wallet balance: ${fmtCredits(r.data.balance)} CW Credits.`));
      const closeRow = el('div', 'adm-actions');
      const wallet = el('a', 'shop-btn', 'Go to wallet');
      wallet.href = 'wallet.html';
      const close = el('button', 'shop-btn shop-btn--ghost', 'Close');
      close.type = 'button';
      close.addEventListener('click', () => { back.remove(); load(); });
      closeRow.append(wallet, close);
      box.append(closeRow);
    });
    row.append(ok, cancel);
    box.append(row);
    back.append(box);
    back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
    document.body.append(back);
  }

  async function load() {
    const r = await creditsCall('points');
    if (!r.ok) {
      root.replaceChildren(header(), el('p', null, r.data.error || 'Rewards aren\'t available right now.'));
      return;
    }
    state = r.data;
    draw();
  }

  if (!readLogin()) {
    const box = el('div', 'pd-buybox');
    box.append(el('p', null, 'Log in with Discord or a CW PLAY account to collect CW Points.'), loginLink('Log in'));
    root.replaceChildren(header(), box);
    return;
  }
  load();
})();
