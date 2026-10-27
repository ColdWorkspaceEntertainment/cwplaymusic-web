// CW Chat: direct messages + public servers with text channels, explore, server settings, reports. Live updates by polling.
(() => {
  const root = document.getElementById('chatPage');
  if (!root) return;
  const CHAT_API = CREDITS_API.replace('credits.php', 'chat.php'); // same server as the store
  const call = (action, extra = {}) => apiCall(CHAT_API, action, extra);
  const CAT = { music: '🎵 Music', gaming: '🎮 Gaming', art: '🎨 Art', chat: '💬 Chat', community: '🌍 Community', other: '✨ Other' };
  let me = null;
  let view = { type: 'home' }; // home | dm | channel | explore | create | settings
  let messages = [];
  let lastId = 0;
  let draft = '';
  let busy = false;
  let data = { dms: [], servers: [], groups: [] };
  let paneInfo = {};

  const time = (ts) => new Date(ts * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const btn = (text, cls = 'shop-btn shop-btn--ghost') => { const b = el('button', cls, text); b.type = 'button'; return b; };
  const serverOf = (id) => data.servers.find((s) => s.id === id);
  const STATUS = { online: 'Online', idle: 'Idle', offline: 'Offline' };
  const dot = (st) => { const d = el('span', `cc-st cc-st--${st || 'offline'}`); d.title = STATUS[st] || 'Offline'; return d; };

  function header() {
    const head = el('header', 'shop-head');
    const t = el('div');
    t.append(el('span', 'shop-kicker', 'CW PLAY'), el('h2', null, 'CW Chat'),
      el('p', null, 'Message people and join servers. Be kind: messages and servers that break the rules can be removed.'));
    head.append(t);
    return head;
  }

  async function report(kind, target, label) {
    const reason = window.prompt(`Report ${label}: what's wrong? (up to 300 characters)`);
    if (!reason || !reason.trim()) return;
    const r = await call('report', { kind, target: String(target), reason: reason.trim() });
    showToast(r.ok ? 'Thanks, your report was sent to Cold Works Production.' : (r.data.error || 'The report couldn\'t be sent.'));
  }

  // ---------------------------------------------------------------- layout
  const layout = el('div', 'cc cc--3');
  const rail = el('nav', 'cc-rail');
  const side = el('aside', 'cc-side pd-buybox');
  const pane = el('section', 'cc-pane pd-buybox');

  function drawRail() {
    rail.replaceChildren();
    const item = (label, title, active, onClick, dot) => {
      const b = btn(label, `cc-rail-item${active ? ' is-active' : ''}`);
      b.title = title;
      if (dot) b.append(el('span', 'cc-dot'));
      b.addEventListener('click', onClick);
      rail.append(b);
    };
    const dmUnread = data.dms.some((d) => d.unread) || data.groups.some((g) => g.unread);
    item('💬', 'Direct messages', ['home', 'dm', 'group', 'group_new', 'group_manage'].includes(view.type), () => go({ type: 'home' }), dmUnread);
    data.servers.forEach((s) => {
      const active = (view.type === 'channel' || view.type === 'settings') && view.server === s.id;
      item(s.name.slice(0, 2).toUpperCase(), s.name, active, () => go({ type: 'channel', server: s.id, channel: (s.channels[0] || {}).id }),
        s.channels.some((c) => c.unread));
    });
    item('＋', 'Create a server', view.type === 'create', () => go({ type: 'create' }));
    item('🧭', 'Explore servers', view.type === 'explore', () => go({ type: 'explore' }));
  }

  function invisibleToggle() {
    const lab = el('label', 'cc-invis');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!me.invisible;
    cb.addEventListener('change', async () => {
      const r = await call('set_invisible', { on: cb.checked });
      if (!r.ok) { cb.checked = !cb.checked; return showToast(r.data.error); }
      me.invisible = cb.checked;
      showToast(cb.checked ? 'You now appear offline to everyone.' : 'Others can see when you\'re online again.');
    });
    lab.append(cb, el('span', null, 'Appear offline'));
    return lab;
  }

  // side: DM list (with search) or the server's channels
  const search = el('input');
  Object.assign(search, { placeholder: 'Find someone…', type: 'search' });
  const results = el('div', 'cc-results');
  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      results.replaceChildren();
      if (search.value.trim().length < 2) return;
      const r = await call('search', { q: search.value.trim() });
      (r.ok ? r.data.users : []).forEach((u) => {
        const b = btn(u.name, 'cc-item');
        b.prepend(dot(u.status));
        b.addEventListener('click', async () => {
          const o = await call('open_dm', { user: u.id });
          if (o.ok) { search.value = ''; results.replaceChildren(); go({ type: 'dm', id: o.data.dm }); } else showToast(o.data.error);
        });
        results.append(b);
      });
      if (!results.childElementCount) results.append(el('span', 'w-sub', 'No one found. People appear here after they open CW Chat once.'));
    }, 300);
  });
  const sideList = el('div', 'cc-list');
  let sideMode = '';

  function drawSide() {
    const srv = (view.type === 'channel' || view.type === 'settings') ? serverOf(view.server) : null;
    const mode = srv ? `server:${srv.id}` : 'dms';
    if (mode !== sideMode) {
      sideMode = mode;
      if (srv) side.replaceChildren(el('p', 'pd-price-label', srv.name), sideList);
      else side.replaceChildren(el('p', 'pd-price-label', 'Direct messages'), invisibleToggle(), search, results, sideList);
    }
    sideList.replaceChildren();
    if (srv) {
      srv.channels.forEach((c) => {
        const b = btn('', `cc-item${view.type === 'channel' && view.channel === c.id ? ' is-active' : ''}`);
        b.append(el('span', 'cc-item-text', `# ${c.name}`));
        if (c.unread) b.append(el('span', 'cc-badge', String(c.unread)));
        b.addEventListener('click', () => go({ type: 'channel', server: srv.id, channel: c.id }));
        sideList.append(b);
      });
      const set = btn(['owner', 'mod'].includes(srv.role) ? '⚙️ Server settings' : 'ℹ️ Server info', `cc-item${view.type === 'settings' ? ' is-active' : ''}`);
      set.addEventListener('click', () => go({ type: 'settings', server: srv.id }));
      sideList.append(set);
      return;
    }
    if (!data.dms.length) sideList.append(el('p', 'w-sub', 'No conversations yet. Find someone above to start one.'));
    data.dms.forEach((d) => {
      const b = btn('', `cc-item${view.type === 'dm' && view.id === d.id ? ' is-active' : ''}`);
      const txt = el('span', 'cc-item-text');
      txt.append(el('strong', null, d.name), el('span', 'w-sub', d.preview || ' '));
      b.append(dot(d.status), txt);
      if (d.unread) b.append(el('span', 'cc-badge', String(d.unread)));
      b.addEventListener('click', () => go({ type: 'dm', id: d.id }));
      sideList.append(b);
    });
    const gh = el('div', 'cc-row cc-group-head');
    const newG = btn('＋ New group', 'shop-btn shop-btn--ghost');
    newG.addEventListener('click', () => go({ type: 'group_new' }));
    gh.append(el('p', 'pd-price-label', 'Groups'), newG);
    sideList.append(gh);
    if (!data.groups.length) sideList.append(el('p', 'w-sub', 'Make a group chat with up to 10 people.'));
    data.groups.forEach((g) => {
      const b = btn('', `cc-item${['group', 'group_manage'].includes(view.type) && view.id === g.id ? ' is-active' : ''}`);
      const txt = el('span', 'cc-item-text');
      txt.append(el('strong', null, `👥 ${g.name}`), el('span', 'w-sub', g.in_call ? `🔊 ${g.in_call} in call` : (g.preview || `${g.members} members`)));
      if (g.online) txt.append(el('span', 'cc-online', `🟢 ${g.online} online`));
      b.append(txt);
      if (g.unread) b.append(el('span', 'cc-badge', String(g.unread)));
      b.addEventListener('click', () => go({ type: 'group', id: g.id }));
      sideList.append(b);
    });
  }

  // ---------------------------------------------------------------- messages (DM or channel)
  function drawMessages(info) {
    const isDm = view.type === 'dm';
    const top = el('div', 'cc-top');
    if (isDm) {
      if (!info.other) return pane.replaceChildren(el('p', 'w-sub', 'Loading…'));
      const who = el('div', 'cc-who');
      who.append(dot(info.other.status), el('strong', null, info.other.name), el('span', 'w-sub', STATUS[info.other.status] || 'Offline'));
      top.append(who);
      const acts = el('div', 'adm-actions');
      if (!info.blocked_by_me && !info.suspended) {
        const ph = btn('📞 Call');
        ph.addEventListener('click', () => startCall(view.id, info.other.name));
        acts.append(ph);
      }
      if (info.other.id !== me.owner_id || me.owner) {
        const blk = btn(info.blocked_by_me ? 'Unblock' : 'Block');
        blk.addEventListener('click', async () => {
          if (!info.blocked_by_me && !window.confirm(`Block ${info.other.name}? You won't receive their messages.`)) return;
          const r = await call(info.blocked_by_me ? 'unblock' : 'block', { user: info.other.id });
          showToast(r.ok ? (info.blocked_by_me ? 'Unblocked.' : 'Blocked.') : r.data.error);
          refresh(true);
        });
        const rep = btn('⚑');
        rep.title = 'Report';
        rep.addEventListener('click', () => report('user', info.other.id, info.other.name));
        acts.append(blk, rep);
      }
      top.append(acts);
    } else if (view.type === 'group') {
      if (!info.group) return pane.replaceChildren(el('p', 'w-sub', 'Loading…'));
      const g = data.groups.find((x) => x.id === view.id) || {};
      top.append(el('strong', null, `👥 ${info.group.name}`));
      const acts = el('div', 'adm-actions');
      const inThis = gc.call && gc.group === view.id;
      const join = btn(inThis ? 'Leave call' : `🔊 ${g.in_call ? `Join call (${g.in_call})` : 'Start call'}`, inThis ? 'shop-btn acc-hangup' : 'shop-btn shop-btn--ghost');
      join.addEventListener('click', () => (inThis ? gcLeave() : gcJoin(view.id, info.group.name)));
      const man = btn('⚙️ Members');
      man.addEventListener('click', () => go({ type: 'group_manage', id: view.id }));
      acts.append(join, man);
      top.append(acts);
    } else {
      if (!info.channel) return pane.replaceChildren(el('p', 'w-sub', 'Loading…'));
      top.append(el('strong', null, `# ${info.channel.name}`));
    }
    const canMod = !isDm && info.channel && ['owner', 'mod', 'admin'].includes(info.channel.role);
    const list = el('div', 'chat-list cc-msgs');
    messages.forEach((m) => {
      const mine = m.author === me.id;
      const who = m.system ? 'CW Chat' : mine ? 'You' : (isDm ? info.other.name : m.name);
      const b = el('div', `chat-msg ${mine ? 'is-me' : ''} ${m.system ? 'cc-system' : ''}`);
      b.append(el('span', 'chat-who', `${who} · ${time(m.created)}`), el('span', null, m.deleted ? 'Message deleted' : m.text));
      if (!m.deleted && !m.system && m.id) {
        const tools = el('span', 'cc-tools');
        if (mine || canMod) {
          const del = btn('×', 'cc-tool');
          del.title = 'Delete';
          del.addEventListener('click', async () => {
            if (!window.confirm('Delete this message?')) return;
            const r = await call('delete_message', { id: m.id });
            if (r.ok) { m.deleted = true; drawMessages(info); } else showToast(r.data.error);
          });
          tools.append(del);
        }
        if (!mine) {
          const rep = btn('⚑', 'cc-tool');
          rep.title = 'Report message';
          rep.addEventListener('click', () => report('message', m.id, 'this message'));
          tools.append(rep);
        }
        b.append(tools);
      }
      list.append(b);
    });
    if (!messages.length) list.append(el('p', 'w-sub', isDm ? 'Say hi! 👋' : 'No messages yet. Start the conversation!'));
    const parts = [top];
    if (info.suspended) parts.push(el('p', 'cc-banner', 'Your communication with Cold Works Production has been blocked. Your messages are not delivered.'));
    if (info.blocked_by_me) parts.push(el('p', 'cc-banner', 'You blocked this person. Unblock them to send messages.'));
    const row = el('form', 'chat-row');
    const input = el('textarea');
    Object.assign(input, { rows: 2, maxLength: 2000, placeholder: isDm ? `Message ${info.other.name}…` : info.group ? `Message ${info.group.name}…` : `Message #${info.channel.name}…`, value: draft });
    input.addEventListener('input', () => { draft = input.value; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); row.requestSubmit(); } });
    const send = el('button', 'shop-btn', 'Send');
    send.type = 'submit';
    row.append(input, send);
    row.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || busy) return;
      busy = true;
      const r = isDm ? await call('send', { dm: view.id, text })
        : view.type === 'group' ? await call('send_group', { group: view.id, text }) : await call('send_channel', { channel: view.channel, text });
      busy = false;
      if (!r.ok) return showToast(r.data.error || 'Your message couldn\'t be sent.');
      draft = '';
      if (r.data.blocked) {
        const now = Date.now() / 1000;
        messages.push({ id: 0, author: me.id, text, created: now }, { id: 0, system: true, text: r.data.notice, created: now });
        drawMessages({ ...info, suspended: true });
        return;
      }
      refresh(true);
    });
    parts.push(list, row);
    pane.replaceChildren(...parts);
    list.scrollTop = list.scrollHeight;
    input.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- explore
  async function drawExplore() {
    const q = el('input'); Object.assign(q, { type: 'search', placeholder: 'Search servers…' });
    const cat = el('select', 'adm-select');
    [['', 'All categories'], ...Object.entries(CAT)].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; cat.append(o); });
    const sort = el('select', 'adm-select');
    [['members', 'Most members'], ['active', 'Recently active']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; sort.append(o); });
    const grid = el('div', 'cc-explore');
    const bar = el('div', 'cc-explore-bar');
    bar.append(q, cat, sort);
    pane.replaceChildren(el('strong', null, '🧭 Explore servers'), bar, grid);
    const load = async () => {
      const r = await call('explore', { q: q.value.trim(), category: cat.value, sort: sort.value });
      grid.replaceChildren();
      const list = r.ok ? r.data.servers : [];
      if (!list.length) grid.append(el('p', 'w-sub', 'No servers found. Create the first one with ＋!'));
      list.forEach((s) => {
        const card = el('div', 'cc-card');
        card.append(el('strong', null, s.name), el('span', 'w-sub', `${CAT[s.category] || s.category} · ${s.members} member${s.members === 1 ? '' : 's'} · active ${time(s.last_at)}`));
        if (s.descr) card.append(el('p', null, s.descr));
        const acts = el('div', 'adm-actions');
        const join = btn(s.joined ? 'Open' : 'Join', 'shop-btn');
        join.addEventListener('click', async () => {
          if (s.joined) return go({ type: 'channel', server: s.id, channel: (serverOf(s.id)?.channels[0] || {}).id });
          const j = await call('server_join', { server: s.id });
          if (!j.ok) return showToast(j.data.error);
          showToast(`You joined ${s.name}.`);
          await refresh();
          go({ type: 'channel', server: s.id, channel: j.data.channel });
        });
        const rep = btn('⚑');
        rep.title = 'Report server';
        rep.addEventListener('click', () => report('server', s.id, s.name));
        acts.append(join, rep);
        card.append(acts);
        grid.append(card);
      });
    };
    let t;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 300); });
    cat.addEventListener('change', load);
    sort.addEventListener('change', load);
    load();
  }

  // ---------------------------------------------------------------- create
  function drawCreate() {
    const form = el('form', 'wallet-form');
    const name = el('input'); Object.assign(name, { maxLength: 40, placeholder: 'Server name' });
    const descr = el('textarea'); Object.assign(descr, { maxLength: 200, rows: 2, placeholder: 'What is it about? (optional)' });
    const cat = el('select', 'adm-select');
    Object.entries(CAT).forEach(([v, t]) => { const o = el('option', null, t); o.value = v; cat.append(o); });
    const row = (l, i) => { const x = el('label', 'disc-row'); x.append(el('span', null, l), i); return x; };
    const ok = el('button', 'shop-btn', 'Create server');
    ok.type = 'submit';
    form.append(row('Name', name), row('Description', descr), row('Category', cat),
      el('p', 'w-sub', 'Servers are public: anyone can find and join them on Explore. You can own up to 5 servers.'), ok);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await call('server_create', { name: name.value.trim(), descr: descr.value.trim(), category: cat.value });
      if (!r.ok) return showToast(r.data.error);
      showToast('Server created.');
      await refresh();
      go({ type: 'channel', server: r.data.server, channel: r.data.channel });
    });
    pane.replaceChildren(el('strong', null, '＋ Create a server'), form);
    name.focus();
  }

  // ---------------------------------------------------------------- settings / info
  async function drawSettings() {
    const r = await call('server_info', { server: view.server });
    if (!r.ok) return pane.replaceChildren(el('p', null, r.data.error));
    const { role, server: s, channels, members, bans } = r.data;
    const owner = role === 'owner' || (role === 'admin');
    const mod = owner || role === 'mod';
    const act = async (action, extra, msg, ask) => {
      if (ask && !window.confirm(ask)) return null;
      const x = await call(action, { server: s.id, ...extra });
      showToast(x.ok ? msg : (x.data.error || 'Failed.'));
      if (x.ok) { await refresh(); if (action !== 'server_delete') drawSettings(); }
      return x;
    };
    const parts = [el('strong', null, `${s.name}`), el('span', 'w-sub', `${CAT[s.category] || s.category}${s.descr ? ` · ${s.descr}` : ''}`)];
    if (owner) {
      const name = el('input'); Object.assign(name, { maxLength: 40, value: s.name });
      const descr = el('input'); Object.assign(descr, { maxLength: 200, value: s.descr, placeholder: 'Description' });
      const cat = el('select', 'adm-select');
      Object.entries(CAT).forEach(([v, t]) => { const o = el('option', null, t); o.value = v; o.selected = v === s.category; cat.append(o); });
      const save = btn('Save', 'shop-btn');
      save.addEventListener('click', () => act('server_update', { name: name.value.trim(), descr: descr.value.trim(), category: cat.value }, 'Saved.'));
      const box = el('div', 'cc-set');
      box.append(el('p', 'pd-price-label', 'Server'), name, descr, cat, save);
      parts.push(box);
    }
    if (mod) {
      const box = el('div', 'cc-set');
      box.append(el('p', 'pd-price-label', 'Channels'));
      channels.forEach((c) => {
        const rowx = el('div', 'cc-row');
        rowx.append(el('span', null, `# ${c.name}`));
        const ren = btn('Rename');
        ren.addEventListener('click', () => { const n = window.prompt('New channel name', c.name); if (n) act('channel_rename', { channel: c.id, name: n }, 'Renamed.'); });
        const del = btn('Delete');
        del.addEventListener('click', () => act('channel_delete', { channel: c.id }, 'Channel deleted.', `Delete #${c.name} and its messages?`));
        rowx.append(ren, del);
        box.append(rowx);
      });
      const nc = el('input'); Object.assign(nc, { maxLength: 30, placeholder: 'new-channel' });
      const add = btn('Add channel', 'shop-btn');
      add.addEventListener('click', () => { if (nc.value.trim()) act('channel_create', { name: nc.value.trim() }, 'Channel added.'); });
      const addRow = el('div', 'cc-row');
      addRow.append(nc, add);
      box.append(addRow);
      parts.push(box);
    }
    const mbox = el('div', 'cc-set');
    mbox.append(el('p', 'pd-price-label', `Members (${members.length})`));
    members.forEach((m) => {
      const rowx = el('div', 'cc-row');
      const nm = el('span', null, `${m.name}${m.role !== 'member' ? ` · ${m.role === 'owner' ? '👑 owner' : '🛡️ mod'}` : ''}`);
      nm.prepend(dot(m.status));
      rowx.append(nm);
      const canAct = m.id !== me.id && m.role !== 'owner' && (owner || (mod && m.role === 'member'));
      if (canAct) {
        if (owner) {
          const rb = btn(m.role === 'mod' ? 'Remove mod' : 'Make mod');
          rb.addEventListener('click', () => act('member_role', { user: m.id, role: m.role === 'mod' ? 'member' : 'mod' }, 'Role updated.'));
          rowx.append(rb);
        }
        const kick = btn('Kick');
        kick.addEventListener('click', () => act('member_kick', { user: m.id }, 'Kicked.', `Kick ${m.name}? They can join again.`));
        const ban = btn('Ban');
        ban.addEventListener('click', () => act('member_ban', { user: m.id }, 'Banned.', `Ban ${m.name}? They can't join again until unbanned.`));
        rowx.append(kick, ban);
      }
      mbox.append(rowx);
    });
    parts.push(mbox);
    if (mod && bans.length) {
      const bbox = el('div', 'cc-set');
      bbox.append(el('p', 'pd-price-label', 'Banned'));
      bans.forEach((b) => {
        const rowx = el('div', 'cc-row');
        const ub = btn('Unban');
        ub.addEventListener('click', () => act('member_unban', { user: b.id }, 'Unbanned.'));
        rowx.append(el('span', null, b.name), ub);
        bbox.append(rowx);
      });
      parts.push(bbox);
    }
    const danger = el('div', 'adm-actions');
    if (role === 'owner' || role === 'admin') {
      const del = btn('Delete server', 'shop-btn shop-btn--ghost acc-danger');
      del.addEventListener('click', async () => {
        const x = await act('server_delete', {}, 'Server deleted.', `Delete ${s.name} for everyone? This can't be undone.`);
        if (x && x.ok) go({ type: 'home' });
      });
      danger.append(del);
    }
    if (role !== 'owner' && role !== 'admin') {
      const leave = btn('Leave server', 'shop-btn shop-btn--ghost acc-danger');
      leave.addEventListener('click', async () => {
        if (!window.confirm(`Leave ${s.name}?`)) return;
        const x = await call('server_leave', { server: s.id });
        if (x.ok) { showToast('You left the server.'); await refresh(); go({ type: 'home' }); } else showToast(x.data.error);
      });
      danger.append(leave);
    }
    const rep = btn('⚑ Report server');
    rep.addEventListener('click', () => report('server', s.id, s.name));
    danger.append(rep);
    parts.push(danger);
    pane.replaceChildren(...parts);
  }

  // ---------------------------------------------------------------- navigation + sync
  function go(v) {
    if (v.type === 'channel' && !v.channel) {
      const s = serverOf(v.server);
      v.channel = s && s.channels[0] ? s.channels[0].id : 0;
    }
    view = v;
    messages = []; lastId = 0; draft = ''; paneInfo = {};
    drawRail(); drawSide();
    if (v.type === 'explore') drawExplore();
    else if (v.type === 'create') drawCreate();
    else if (v.type === 'settings') drawSettings();
    else if (v.type === 'group_new') drawGroupNew();
    else if (v.type === 'group_manage') drawGroupManage();
    else if (v.type === 'home') pane.replaceChildren(el('p', 'w-sub', 'Choose a conversation, find someone to message, or explore servers with 🧭.'));
    else pane.replaceChildren(el('p', 'w-sub', 'Loading…'));
    refresh(true);
  }

  async function refresh(force = false) {
    const params = { since: lastId, idle: document.hidden };
    if (view.type === 'dm') params.dm = view.id;
    if (view.type === 'channel') params.channel = view.channel;
    if (view.type === 'group') params.group = view.id;
    const want = JSON.stringify(view);
    const r = await call('sync', params);
    if (!r.ok || JSON.stringify(view) !== want) return;
    data = { dms: r.data.dms || [], servers: r.data.servers || [], groups: r.data.groups || [] };
    if (r.data.incoming && !vc.id && r.data.incoming.id !== vc.dismissed) showIncoming(r.data.incoming);
    drawRail(); drawSide();
    if (['dm', 'channel', 'group'].includes(view.type) && r.data.messages) {
      if (r.data.messages.length) {
        messages = messages.filter((m) => m.id).concat(r.data.messages);
        lastId = messages[messages.length - 1].id;
      }
      const g = data.groups.find((x) => x.id === view.id);
      const info = view.type === 'dm'
        ? { other: r.data.other, blocked_by_me: r.data.blocked_by_me, suspended: r.data.suspended }
        : view.type === 'group' ? { group: r.data.group, in_call: g ? g.in_call : 0, mine: gc.call && gc.group === view.id } : { channel: r.data.channel };
      if (force || r.data.messages.length || JSON.stringify(info) !== JSON.stringify(paneInfo)) drawMessages(info);
      paneInfo = info;
    } else if ((view.type === 'channel' || view.type === 'group') && !r.data.messages) {
      pane.replaceChildren(el('p', null, 'This conversation isn\'t available anymore.'));
    }
  }

  // ---------------------------------------------------------------- DM voice calls (WebRTC, peer to peer; the server only passes connection messages)
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  const vc = { id: 0, role: '', name: '', pc: null, local: null, since: 0, poll: null, tick: null, started: 0, iceQueue: [], remoteSet: false, dismissed: 0, ring: null };
  const remoteAudio = el('audio');
  remoteAudio.autoplay = true;
  const card = el('div', 'cc-call');
  card.hidden = true;
  document.body.append(card, remoteAudio);

  // sound effects (browsers only allow sound after the first click on the page, so we unlock it then)
  let actx = null;
  const audioCtx = () => {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); } catch (err) { return null; }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  };
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => audioCtx(), { once: true, capture: true }));
  function tone(freqs, dur, vol = 0.07, delay = 0) {
    const ctx = audioCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.02); g.gain.setValueAtTime(vol, t0 + dur - 0.05); g.gain.linearRampToValueAtTime(0, t0 + dur);
    g.connect(ctx.destination);
    freqs.forEach((f) => { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(g); o.start(t0); o.stop(t0 + dur); });
  }
  const sfx = {
    connect: () => { tone([660], 0.12); tone([880], 0.16, 0.07, 0.13); },
    hangup: () => { tone([620], 0.14); tone([440], 0.22, 0.07, 0.15); },
    mute: () => tone([300], 0.08, 0.06),
    unmute: () => tone([520], 0.08, 0.06),
    join: () => { tone([520], 0.1, 0.05); tone([780], 0.12, 0.05, 0.1); },
    leave: () => { tone([780], 0.1, 0.05); tone([520], 0.12, 0.05, 0.1); },
  };
  function ringtone(mode) { // 'in' = someone is calling you, 'out' = you're calling (ringback), false = stop
    if (vc.ring) { clearInterval(vc.ring); vc.ring = null; }
    if (!mode) return;
    const once = mode === 'in' ? () => { tone([440, 480], 0.8, 0.08); tone([440, 480], 0.8, 0.08, 1.0); } : () => tone([425], 1.0, 0.05);
    once();
    vc.ring = setInterval(once, mode === 'in' ? 3000 : 4000);
  }

  function drawCard(status, buttons) {
    card.hidden = false;
    const t = el('div', 'cc-call-text');
    t.append(el('strong', null, `📞 ${vc.name}`), el('span', 'w-sub cc-call-status', status));
    const row = el('div', 'adm-actions');
    buttons.forEach(([label, cls, fn]) => { const b = btn(label, cls); b.addEventListener('click', fn); row.append(b); });
    card.replaceChildren(t, row);
  }
  const setStatus = (text) => { const x = card.querySelector('.cc-call-status'); if (x) x.textContent = text; };

  function cleanup(message) {
    clearInterval(vc.poll); clearInterval(vc.tick); ringtone(false);
    if (vc.pc) vc.pc.close();
    if (vc.local) vc.local.getTracks().forEach((tr) => tr.stop());
    remoteAudio.srcObject = null;
    if (message && message !== 'Missed call') sfx.hangup();
    Object.assign(vc, { id: 0, role: '', pc: null, local: null, since: 0, poll: null, tick: null, started: 0, iceQueue: [], remoteSet: false });
    if (message) { drawCard(message, []); setTimeout(() => { if (!vc.id) card.hidden = true; }, 3500); } else card.hidden = true;
  }

  async function hangUp() {
    const id = vc.id;
    cleanup('Call ended');
    if (id) await call_('call_end', { call: id });
  }
  const call_ = (action, extra) => apiCall(CHAT_API, action, extra);

  function controls() {
    let muted = false;
    const muteBtn = ['Mute', 'shop-btn shop-btn--ghost', (e) => {
      muted = !muted;
      vc.local.getAudioTracks().forEach((tr) => { tr.enabled = !muted; });
      e.target.textContent = muted ? 'Unmute' : 'Mute';
      (muted ? sfx.mute : sfx.unmute)();
    }];
    return [muteBtn, ['Hang up', 'shop-btn acc-hangup', hangUp]];
  }

  async function getMic() {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    } catch (err) {
      showToast('Microphone access is needed for calls. Allow it in your browser and try again.');
      return null;
    }
  }

  function makePc() {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    pc.onicecandidate = (e) => { if (e.candidate && vc.id) call_('call_signal', { call: vc.id, kind: 'ice', data: JSON.stringify(e.candidate) }); };
    pc.ontrack = (e) => { remoteAudio.srcObject = e.streams[0]; remoteAudio.play().catch(() => {}); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected' && !vc.started) {
        vc.started = Date.now();
        ringtone(false);
        drawCard('Connected · 0:00', controls());
        sfx.connect();
        vc.tick = setInterval(() => {
          const sec = Math.floor((Date.now() - vc.started) / 1000);
          setStatus(`Connected · ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
        }, 1000);
      }
      if (pc.connectionState === 'failed') {
        const id = vc.id;
        cleanup('Couldn\'t connect. Your network may be blocking direct calls.');
        if (id) call_('call_end', { call: id });
      }
    };
    vc.local.getTracks().forEach((tr) => pc.addTrack(tr, vc.local));
    return pc;
  }

  async function addIce(c) {
    if (!vc.remoteSet) { vc.iceQueue.push(c); return; }
    try { await vc.pc.addIceCandidate(c); } catch (err) { /* stale candidate */ }
  }

  async function pollCall() {
    if (!vc.id) return;
    const r = await call_('call_poll', { call: vc.id, since: vc.since });
    if (!r.ok || !vc.id) return;
    for (const sg of r.data.signals) {
      vc.since = sg.id;
      const d = JSON.parse(sg.data);
      if (sg.kind === 'offer' && vc.role === 'callee') {
        await vc.pc.setRemoteDescription(d);
        vc.remoteSet = true;
        const ans = await vc.pc.createAnswer();
        await vc.pc.setLocalDescription(ans);
        await call_('call_signal', { call: vc.id, kind: 'answer', data: JSON.stringify(ans) });
        for (const c of vc.iceQueue.splice(0)) await addIce(c);
      } else if (sg.kind === 'answer' && vc.role === 'caller') {
        await vc.pc.setRemoteDescription(d);
        vc.remoteSet = true;
        for (const c of vc.iceQueue.splice(0)) await addIce(c);
      } else if (sg.kind === 'ice') {
        const candidate = new RTCIceCandidate(d);
        await addIce(candidate);
      }
    }
    if (vc.id) {
      clearTimeout(vc.poll);
      vc.poll = setTimeout(pollCall, vc.started ? 1000 : 2000);
    }
  }

  async function startCall(dmId, recipientName) {
    if (vc.id) return;
    const local = await getMic();
    if (!local) return;
    
    const r = await call_('call_start', { dm: dmId });
    if (!r.ok) {
      local.getTracks().forEach(tr => tr.stop());
      return showToast(r.data.error || 'Could not start call.');
    }

    Object.assign(vc, {
      id: r.data.call,
      role: 'caller',
      name: recipientName,
      local: local,
      since: 0,
      started: 0,
      iceQueue: [],
      remoteSet: false
    });

    vc.pc = makePc();
    const offer = await vc.pc.createOffer();
    await vc.pc.setLocalDescription(offer);
    await call_('call_signal', { call: vc.id, kind: 'offer', data: JSON.stringify(offer) });

    ringtone('out');
    drawCard('Ringing…', [['Cancel', 'shop-btn acc-hangup', hangUp]]);
    vc.poll = setTimeout(pollCall, 1000);
  }

  async function showIncoming(inc) {
    if (vc.id || inc.id === vc.dismissed) return;
    Object.assign(vc, {
      id: inc.id,
      role: 'callee',
      name: inc.name,
      since: 0,
      started: 0,
      iceQueue: [],
      remoteSet: false
    });
    ringtone('in');
    drawCard('Incoming call…', [
      ['Accept', 'shop-btn', async () => {
        ringtone(false);
        const local = await getMic();
        if (!local) { hangUp(); return; }
        vc.local = local;
        vc.pc = makePc();
        drawCard('Connecting…', controls());
        vc.poll = setTimeout(pollCall, 500);
      }],
      ['Decline', 'shop-btn acc-hangup', async () => {
        vc.dismissed = vc.id;
        cleanup('Missed call');
        await call_('call_end', { call: vc.id });
      }]
    ]);
  }
})();
