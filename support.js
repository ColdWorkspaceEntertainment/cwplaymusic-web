// Help page: ask Fizzy Littlejoy; if Fizzy can't answer (or you ask for a person), Bora replies here.
(() => {
  const root = document.getElementById('supportPage');
  if (!root) return;

  const QUICK = [
    'How do I get CW Credits?',
    'Where can I see my order?',
    'How do subscriptions work?',
    'How do I get my film shown at CW PLAY Cinema?',
  ];
  const STATE = { available: 'Bora is available', busy: 'Bora is busy', away: 'Bora is away' };
  let messages = [];
  let human = false;
  let draft = ''; // what you're typing survives redraws (e.g. when Bora replies)

  function header(text) {
    const head = el('header', 'shop-head');
    const t = el('div');
    t.append(el('span', 'shop-kicker', 'FIZZY LITTLEJOY'), el('h2', null, 'Help'));
    t.append(el('p', null, text));
    head.append(t);
    return head;
  }

  function bubble(m) {
    const who = { user: 'You', fizzy: 'Fizzy', owner: 'Bora' }[m.who] || m.who;
    const b = el('div', `chat-msg chat-msg--${m.who} ${m.who === 'user' ? 'is-me' : ''}`);
    const time = new Date(m.created * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    b.append(el('span', 'chat-who', `${who} · ${time}`), el('span', null, m.text));
    return b;
  }

  function draw(info) {
    const box = el('div', 'pd-buybox sup-box');
    const top = el('div', 'sup-top');
    const avatar = el('img', 'sup-avatar');
    avatar.src = 'images/fizzy-avatar.png';
    avatar.alt = '';
    avatar.onerror = () => avatar.remove();
    const who = el('div');
    who.append(el('strong', null, 'Fizzy Littlejoy'),
      el('span', 'w-sub', human ? 'Your question was passed to Bora. He\'ll reply here.' : (info.ai ? 'Assistant · answers about the store' : 'Assistant · answers common questions')));
    top.append(avatar, who, el('span', `w-status w-status--${info.owner === 'available' ? 'approved' : 'pending'}`, STATE[info.owner] || 'Bora'));
    const list = el('div', 'chat-list sup-list');
    if (!messages.length) {
      list.append(bubble({ who: 'fizzy', created: Date.now() / 1000, text: 'Hi! I\'m Fizzy. Ask me about the store, CW Credits, your orders, subscriptions or CW PLAY Cinema. / Merhaba! Mağaza, CW Credits, siparişler, abonelikler ya da CW PLAY Cinema hakkında sorabilirsin.' }));
    }
    messages.forEach((m) => list.append(bubble(m)));
    const quick = el('div', 'sup-quick');
    if (!messages.length) {
      QUICK.forEach((q) => {
        const c = el('button', 'shop-btn shop-btn--ghost', q);
        c.type = 'button';
        c.addEventListener('click', () => send(q));
        quick.append(c);
      });
    }
    const row = el('form', 'chat-row');
    const input = el('textarea');
    Object.assign(input, { rows: 2, maxLength: 1000, placeholder: 'Write your question…', value: draft });
    input.addEventListener('input', () => { draft = input.value; });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        row.requestSubmit();
      }
    });
    const btn = el('button', 'shop-btn', 'Send');
    btn.type = 'submit';
    row.append(input, btn);
    row.addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value.trim()) send(input.value.trim());
    });
    const person = el('button', 'shop-btn shop-btn--ghost', 'Talk to a person');
    person.type = 'button';
    person.disabled = human;
    person.addEventListener('click', async () => {
      person.disabled = true;
      const r = await supportCall('human');
      if (r.ok) {
        messages = r.data.messages;
        human = true;
        draw(info);
      } else {
        showToast(r.data.error || 'Something went wrong.');
        person.disabled = false;
      }
    });
    const foot = el('p', 'w-sub sup-foot', 'Fizzy is an assistant and can make mistakes. It can\'t see your account or change orders. Bora replies by hand, not 24/7.');
    box.append(top, list, quick, row, person, foot);
    root.replaceChildren(header('Questions about the store? Fizzy answers right away. If Fizzy can\'t help, Bora will.'), box);
    list.scrollTop = list.scrollHeight;
    if (document.activeElement === document.body) input.focus({ preventScroll: true });
  }

  let info = { ai: false, owner: 'available' };
  async function send(text) {
    draft = '';
    messages = messages.concat([{ who: 'user', text, created: Date.now() / 1000 }]);
    draw(info);
    const r = await supportCall('send', { text });
    if (r.ok) {
      messages = r.data.messages;
      human = human || r.data.human;
    } else {
      messages = messages.slice(0, -1);
      showToast(r.data.error || 'Your message couldn\'t be sent.');
    }
    draw(info);
  }

  async function start() {
    if (!readLogin()) {
      const box = el('div', 'pd-buybox sup-box');
      box.append(el('p', null, 'Log in with Discord or a CW PLAY account to ask a question. Fizzy answers right away, and Bora sees everything Fizzy can\'t answer.'), loginLink('Log in to ask'));
      root.replaceChildren(header('Questions about the store? Log in and ask Fizzy.'), box);
      return;
    }
    const r = await supportCall('history');
    if (!r.ok) {
      root.replaceChildren(header(r.data.error || 'Help isn\'t available right now.'));
      return;
    }
    messages = r.data.messages || [];
    human = !!(r.data.ticket && r.data.ticket.human);
    info = { ai: r.data.ai, owner: r.data.owner };
    draw(info);
    // check for Bora's replies every 20 seconds while the page is open
    setInterval(async () => {
      if (document.hidden) return;
      const h = await supportCall('history');
      if (h.ok && (h.data.messages || []).length !== messages.length) {
        messages = h.data.messages;
        human = !!(h.data.ticket && h.data.ticket.human);
        draw(info);
      }
    }, 20000);
  }
  start();
})();
