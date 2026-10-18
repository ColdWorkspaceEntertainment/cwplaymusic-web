// =========================================================
//  Status page (status.html)
//  Uses helpers from script.js: el, icon, fetchStatus, timeAgo, ROOT.
//  Refreshes itself every minute.
// =========================================================

(function () {
  const root = document.getElementById('statusPage');
  if (!root) return;

  const LABEL = { ok: 'Operational', degraded: 'Degraded', down: 'Not working' };
  const AVAILABILITY = {
    available: ['Available', 'Orders and CW Credits requests are being reviewed.'],
    busy: ['Busy', 'Reviews may take longer than usual.'],
    away: ['Away', 'Orders and CW Credits requests will be reviewed later.'],
  };
  const BOT = {
    online: ['ok', 'Online'],
    offline: ['down', 'Offline'],
    unknown: ['degraded', 'No signal yet'],
  };

  function header() {
    const head = el('header', 'shop-head');
    const text = el('div');
    text.append(
      el('span', 'shop-kicker', 'Fizzy Littlejoy'),
      el('h2', null, 'Status'),
      el('p', null, 'Live status of Fizzy\'s store, Discord login and CW Credits. This page refreshes every minute.'),
    );
    const store = el('a', 'shop-btn shop-btn--ghost', 'Go to the store');
    store.href = new URL('index.html#store', ROOT).href;
    store.prepend(icon('fa-solid fa-store'));
    head.append(text, store);
    return head;
  }

  function overall(tone, title, text) {
    const box = el('div', `st-overall st-overall--${tone}`);
    box.append(icon(tone === 'ok' ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation'));
    const t = el('div');
    t.append(el('p', 'st-overall-title', title));
    if (text) t.append(el('p', 'st-overall-text', text));
    box.append(t);
    return box;
  }

  function row(name, tone, label, detail) {
    const li = el('li');
    const main = el('div', 'w-main');
    main.append(el('span', null, name));
    if (detail) main.append(el('span', 'w-sub', detail));
    const state = el('span', `st-state st-state--${tone}`);
    state.append(el('span', 'st-dot'), el('span', null, label));
    li.append(main, state);
    return li;
  }

  function render(data) {
    const parts = [header()];

    if (!data) {
      parts.push(overall('down', 'The order server can\'t be reached',
        'Orders, Discord login and CW Credits may not work right now. The website itself is up.'));
      const list = el('ul', 'wallet-list');
      list.append(
        row('Website', 'ok', LABEL.ok),
        row('Store & orders', 'down', 'Unknown'),
        row('Discord login', 'down', 'Unknown'),
        row('CW Credits', 'down', 'Unknown'),
      );
      const s = el('section', 'pd-section');
      s.append(el('h2', null, 'Services'), list);
      parts.push(s);
      root.replaceChildren(...parts);
      return;
    }

    const problems = data.services.filter((x) => x.status !== 'ok');
    parts.push(problems.length
      ? overall('down', problems.length === 1 ? 'One service has a problem' : 'Some services have problems',
        problems.map((x) => x.name).join(', '))
      : overall('ok', 'All systems operational', ''));

    if (data.notice) {
      const notice = el('div', 'pd-buybox st-notice');
      notice.append(el('p', 'pd-price-label', 'Notice'), el('p', 'st-notice-text', data.notice.text),
        el('p', 'w-sub', `Posted ${timeAgo(data.notice.updated)}`));
      parts.push(notice);
    }

    // Owner availability (orders and CW Credits are handled by hand)
    const [availTitle, availText] = AVAILABILITY[data.availability.state] || AVAILABILITY.available;
    const avail = el('div', 'pd-buybox st-avail');
    const state = el('p', `st-avail-state st-avail-state--${data.availability.state}`);
    state.append(el('span', 'st-dot'), el('span', null, `Cold Works Production: ${availTitle}`));
    avail.append(el('p', 'pd-price-label', 'Availability'), state, el('p', null, availText));
    if (data.availability.note) avail.append(el('p', 'st-avail-note', data.availability.note));
    avail.append(el('p', 'pd-note', 'Orders and CW Credits requests are reviewed by hand and not around the clock, so replies can take a while, for example overnight.'));
    if (data.availability.updated) avail.append(el('p', 'w-sub', `Updated ${timeAgo(data.availability.updated)}`));
    parts.push(avail);

    // Services
    const list = el('ul', 'wallet-list');
    list.append(row('Website', 'ok', LABEL.ok));
    data.services.forEach((x) => list.append(row(x.name, x.status, LABEL[x.status] || x.status, x.detail)));
    const [botTone, botLabel] = BOT[data.bot.status] || BOT.unknown;
    list.append(row('Fizzy (Discord bot)', botTone, botLabel,
      data.bot.last_seen && data.bot.status !== 'online' ? `Last seen ${timeAgo(data.bot.last_seen)}` : ''));
    const s = el('section', 'pd-section');
    s.append(el('h2', null, 'Services'), list,
      el('p', 'w-sub st-checked', `Checked ${new Date(data.ts * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`));
    parts.push(s);

    root.replaceChildren(...parts);
  }

  async function load(force) {
    render(await fetchStatus(force));
  }

  load(true);
  setInterval(() => load(true), 60 * 1000);
})();
