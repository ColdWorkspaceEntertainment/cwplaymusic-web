// CW Chat (phase 1): direct messages, blocking, live updates (polling).
(() => {
  const root = document.getElementById('chatPage');
  if (!root) return;
  const CHAT_API = CREDITS_API.replace('credits.php', 'chat.php'); // same server as the store
  const call = (action, extra = {}) => apiCall(CHAT_API, action, extra);
  let me = null;
  let current = null; // { id, other: {id, name} }
  let messages = [];
  let lastId = 0;
  let draft = '';
  let busy = false;

  const time = (ts) => new Date(ts * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function header() {
    const head = el('header', 'shop-head');
    const t = el('div');
    t.append(el('span', 'shop-kicker', 'CW PLAY'), el('h2', null, 'CW Chat'), el('p', null, 'Message other CW PLAY members. Be kind: messages that break the rules can be removed.'));
    head.append(t);
    return head;
  }

  const layout = el('div', 'cc');
  const side = el('aside', 'cc-side pd-buybox');
  const pane = el('section', 'cc-pane pd-buybox');

  const sideList = el('div', 'cc-list');
  function buildSide() {
    const search = el('input');
    Object.assign(search, { placeholder: 'Find someone…', type: 'search' });
    const results = el('div', 'cc-results');
    let timer;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        results.replaceChildren();
        if (search.value.trim().length < 2) return;
        const r = await call('search', { q: search.value.trim() });
        (r.ok ? r.data.users : []).forEach((u) => {
          const b = el('button', 'cc-item', u.name);
          b.type = 'button';
          b.addEventListener('click', async () => {
            const o = await call('open_dm', { user: u.id });
            if (o.ok) { search.value = ''; results.replaceChildren(); openDm(o.data.dm); } else showToast(o.data.error);
          });
          results.append(b);
        });
        if (!results.childElementCount) results.append(el('span', 'w-sub', 'No one found. People appear here after they open CW Chat once.'));
      }, 300);
    });
    side.replaceChildren(el('p', 'pd-price-label', 'Direct messages'), search, results, sideList);
  }

  // only the conversation list is redrawn on every refresh (the search box keeps what you type)
  function drawSide(dms) {
    const list = sideList;
    list.replaceChildren();
    if (!dms.length) list.append(el('p', 'w-sub', 'No conversations yet. Find someone above to start one.'));
    dms.forEach((d) => {
      const b = el('button', `cc-item${current && current.id === d.id ? ' is-active' : ''}`);
      b.type = 'button';
      const txt = el('span', 'cc-item-text');
      txt.append(el('strong', null, d.name), el('span', 'w-sub', d.preview || ' '));
      b.append(txt);
      if (d.unread) b.append(el('span', 'cc-badge', String(d.unread)));
      b.addEventListener('click', () => openDm(d.id));
      list.append(b);
    });
  }

  function drawPane(info) {
    if (!current) {
      pane.replaceChildren(el('p', 'w-sub', 'Choose a conversation or find someone to message.'));
      return;
    }
    const top = el('div', 'cc-top');
    top.append(el('strong', null, current.other.name));
    if (current.other.id !== me.owner_id || me.owner) {
      const blk = el('button', 'shop-btn shop-btn--ghost', info.blocked_by_me ? 'Unblock' : 'Block');
      blk.type = 'button';
      blk.addEventListener('click', async () => {
        if (!info.blocked_by_me && !window.confirm(`Block ${current.other.name}? You won't receive their messages.`)) return;
        const r = await call(info.blocked_by_me ? 'unblock' : 'block', { user: current.other.id });
        showToast(r.ok ? (info.blocked_by_me ? 'Unblocked.' : 'Blocked.') : r.data.error);
        refresh(true);
      });
      top.append(blk);
    }
    const list = el('div', 'chat-list cc-msgs');
    messages.forEach((m) => {
      const mine = m.author === me.id;
      const b = el('div', `chat-msg ${mine ? 'is-me' : ''} ${m.system ? 'cc-system' : ''}`);
      b.append(el('span', 'chat-who', `${m.system ? 'CW Chat' : mine ? 'You' : current.other.name} · ${time(m.created)}`),
        el('span', null, m.deleted ? 'Message deleted' : m.text));
      if (mine && !m.deleted && !m.system) {
        const del = el('button', 'cc-del', '×');
        del.type = 'button';
        del.title = 'Delete';
        del.addEventListener('click', async () => {
          if (!window.confirm('Delete this message?')) return;
          const r = await call('delete_message', { id: m.id });
          if (r.ok) { m.deleted = true; drawPane(info); }
        });
        b.append(del);
      }
      list.append(b);
    });
    if (!messages.length) list.append(el('p', 'w-sub', 'Say hi! 👋'));
    const parts = [top];
    if (info.suspended) parts.push(el('p', 'cc-banner', 'Your communication with Cold Works Production has been blocked. Your messages are not delivered.'));
    if (info.blocked_by_me) parts.push(el('p', 'cc-banner', 'You blocked this person. Unblock them to send messages.'));
    const row = el('form', 'chat-row');
    const input = el('textarea');
    Object.assign(input, { rows: 2, maxLength: 2000, placeholder: `Message ${current.other.name}…`, value: draft });
    input.addEventListener('input', () => { draft = input.value; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); row.requestSubmit(); } });
    const btn = el('button', 'shop-btn', 'Send');
    btn.type = 'submit';
    row.append(input, btn);
    row.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || busy) return;
      busy = true;
      const r = await call('send', { dm: current.id, text });
      busy = false;
      if (!r.ok) return showToast(r.data.error || 'Your message couldn\'t be sent.');
      draft = '';
      if (r.data.blocked) {
        messages.push({ id: 0, author: me.id, text, created: Date.now() / 1000 }, { id: 0, system: true, text: r.data.notice, created: Date.now() / 1000 });
        drawPane({ ...info, suspended: true });
        return;
      }
      refresh(true);
    });
    parts.push(list, row);
    pane.replaceChildren(...parts);
    list.scrollTop = list.scrollHeight;
    input.focus({ preventScroll: true });
  }

  let lastInfo = {};
  async function refresh(force = false) {
    const r = await call('sync', { dm: current ? current.id : 0, since: lastId });
    if (!r.ok) return;
    drawSide(r.data.dms);
    if (current && r.data.messages) {
      current.other = r.data.other;
      if (r.data.messages.length) {
        messages = messages.filter((m) => m.id).concat(r.data.messages);
        lastId = messages[messages.length - 1].id;
      }
      const info = { blocked_by_me: r.data.blocked_by_me, suspended: r.data.suspended };
      if (force || r.data.messages.length || JSON.stringify(info) !== JSON.stringify(lastInfo)) drawPane(info);
      lastInfo = info;
    }
  }

  function openDm(id) {
    current = { id, other: { id: '', name: '…' } };
    messages = []; lastId = 0; draft = ''; lastInfo = {};
    refresh(true);
  }

  async function start() {
    if (!readLogin()) {
      const box = el('div', 'pd-buybox');
      box.append(el('p', null, 'Log in with Discord or a CW PLAY account to use CW Chat.'), loginLink('Log in'));
      root.replaceChildren(header(), box);
      return;
    }
    const r = await call('me');
    if (!r.ok) {
      root.replaceChildren(header(), el('p', null, r.data.error || 'CW Chat isn\'t available right now.'));
      return;
    }
    me = r.data;
    buildSide();
    layout.append(side, pane);
    root.replaceChildren(header(), layout);
    drawPane({});
    const want = new URLSearchParams(location.search).get('dm');
    if (want) openDm(Number(want));
    refresh(true);
    setInterval(() => { if (!document.hidden && !busy) refresh(); }, 3000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }
  start();
})();
