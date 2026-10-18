// =========================================================
//  Login page (account.html): Discord or a CW PLAY account (email + password).
//  Views: login (default), #register, #forgot, ?verify=<token>, ?reset=<token>
//  Uses helpers from script.js: el, icon, readLogin, saveLogin, takeReturnPath,
//  showToast, LOGIN_URL, LOGIN_KEY, ACCOUNT_API, ROOT.
// =========================================================

(function () {
  const root = document.getElementById('accountPage');
  if (!root) return;

  const TERMS = 'https://fizzy.coldworksproduction.com/terms/';
  const PRIVACY = 'https://fizzy.coldworksproduction.com/privacy';

  async function call(action, data) {
    try {
      const res = await fetch(ACCOUNT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ action, ...data }),
      });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok && body.ok === true, status: res.status, data: body };
    } catch (err) {
      return { ok: false, status: 0, data: { error: 'Couldn\'t connect. Check your connection and try again.' } };
    }
  }

  /** Logged in: go back to where the visitor started (or the store). */
  function finish(token, message) {
    if (!saveLogin(token)) {
      showToast('Something went wrong. Try logging in again.');
      return;
    }
    if (message) sessionStorage.setItem('cw_toast', message);
    window.location.replace(takeReturnPath() || new URL('index.html#store', ROOT).href);
  }

  function header(title, text) {
    const head = el('header', 'shop-head');
    const t = el('div');
    t.append(el('span', 'shop-kicker', 'CW PLAY'), el('h2', null, title));
    if (text) t.append(el('p', null, text));
    head.append(t);
    return head;
  }

  function field(label, attrs) {
    const wrap = el('label');
    const input = el('input');
    Object.assign(input, attrs);
    wrap.append(el('span', null, label), input);
    return [wrap, input];
  }

  function errorLine() {
    const p = el('p', 'wallet-error');
    p.setAttribute('role', 'alert');
    return p;
  }

  function busy(button, on, label) {
    button.disabled = on;
    button.textContent = on ? 'Please wait…' : label;
  }

  function link(text, hash) {
    const a = el('a', 'acc-link', text);
    a.href = hash;
    return a;
  }

  // ---------- Login (default)
  function loginView() {
    const discord = el('div', 'pd-buybox acc-box');
    const d = el('a', 'shop-btn shop-btn--block acc-discord', 'Continue with Discord');
    d.href = LOGIN_URL;
    d.prepend(icon('fa-brands fa-discord'));
    discord.append(el('p', 'pd-price-label', 'Discord'), d,
      el('p', 'pd-note', 'We only get your Discord ID and username, never your email or password.'));

    const box = el('div', 'pd-buybox acc-box');
    const form = el('form', 'wallet-form');
    form.noValidate = true;
    const [emailWrap, email] = field('Email', { type: 'email', autocomplete: 'email', required: true });
    const [passWrap, pass] = field('Password', { type: 'password', autocomplete: 'current-password', required: true });
    const err = errorLine();
    const submit = el('button', 'shop-btn shop-btn--block', 'Log in');
    submit.type = 'submit';
    const links = el('p', 'acc-links');
    links.append(link('Create an account', '#register'), link('Forgot your password?', '#forgot'));
    form.append(emailWrap, passWrap, err, submit, links);
    box.append(el('p', 'pd-price-label', 'CW PLAY account'), form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (!email.value.trim() || !pass.value) {
        err.textContent = 'Enter your email and password.';
        return;
      }
      busy(submit, true, 'Log in');
      const { ok, data } = await call('login', { email: email.value.trim(), password: pass.value });
      if (ok) return finish(data.token, `Logged in as ${data.u}`);
      err.textContent = data.error || 'Couldn\'t log in. Try again.';
      busy(submit, false, 'Log in');
    });

    const grid = el('div', 'wallet-grid');
    grid.append(discord, box);
    root.replaceChildren(header('Log in', 'Use Discord, or a CW PLAY account if you don\'t have Discord.'), grid);
  }

  // ---------- Create an account
  function registerView() {
    const box = el('div', 'pd-buybox acc-box acc-narrow');
    const form = el('form', 'wallet-form');
    form.noValidate = true;
    const [emailWrap, email] = field('Email', { type: 'email', autocomplete: 'email', required: true });
    const [userWrap, user] = field('Username', { type: 'text', autocomplete: 'username', maxLength: 32, required: true, placeholder: 'e.g. coldfan' });
    const [passWrap, pass] = field('Password', { type: 'password', autocomplete: 'new-password', minLength: 8, required: true, placeholder: 'At least 8 characters' });
    const [againWrap, again] = field('Repeat password', { type: 'password', autocomplete: 'new-password', required: true });
    const hp = el('input');
    Object.assign(hp, { type: 'text', name: 'website', tabIndex: -1, autocomplete: 'off' });
    hp.className = 'hp';
    hp.setAttribute('aria-hidden', 'true');

    const agreeWrap = el('label', 'check');
    const agree = el('input');
    agree.type = 'checkbox';
    const terms = el('a', null, 'Terms of Use');
    Object.assign(terms, { href: TERMS, target: '_blank', rel: 'noopener' });
    const privacy = el('a', null, 'Privacy Policy');
    Object.assign(privacy, { href: PRIVACY, target: '_blank', rel: 'noopener' });
    const agreeText = el('span', null, 'I accept the ');
    agreeText.append(terms, ' and the ', privacy, '.');
    agreeWrap.append(agree, agreeText);

    const err = errorLine();
    const submit = el('button', 'shop-btn shop-btn--block', 'Create account');
    submit.type = 'submit';
    const links = el('p', 'acc-links');
    links.append(link('I already have an account', '#'));
    form.append(emailWrap, userWrap, passWrap, againWrap, hp, agreeWrap, err, submit, links);
    box.append(form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      const name = user.value.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) return void (err.textContent = 'Enter a valid email address.');
      if (!/^[a-z0-9_.]{2,32}$/.test(name)) return void (err.textContent = 'Usernames can use 2–32 lowercase letters, numbers, dots and underscores.');
      if (pass.value.length < 8) return void (err.textContent = 'Use a password with at least 8 characters.');
      if (pass.value !== again.value) return void (err.textContent = 'The passwords don\'t match.');
      if (!agree.checked) return void (err.textContent = 'Please accept the Terms of Use and the Privacy Policy.');
      busy(submit, true, 'Create account');
      const { ok, data } = await call('register', {
        email: email.value.trim(), username: name, password: pass.value, agree: true, website: hp.value,
      });
      if (ok) return checkEmailView(email.value.trim(), data.mail === false);
      err.textContent = data.error || 'Couldn\'t create the account. Try again.';
      busy(submit, false, 'Create account');
    });

    root.replaceChildren(header('Create a CW PLAY account', 'For ordering without Discord. We\'ll send you an email to confirm your address.'), box);
  }

  function checkEmailView(address, mailFailed) {
    const box = el('div', 'pd-buybox acc-box acc-narrow');
    box.append(
      el('p', 'pd-price', 'Check your email'),
      el('p', null, mailFailed
        ? 'Your account was created, but we couldn\'t send the email right now. Use "Send the email again" in a few minutes.'
        : `If ${address} can be used for a new account, we've sent a link to it. Open it to finish creating your account.`),
      el('p', 'pd-note', 'Can\'t find it? Check your spam folder. The link works for 48 hours.'),
    );
    const resend = el('button', 'shop-btn shop-btn--ghost', 'Send the email again');
    resend.type = 'button';
    resend.addEventListener('click', async () => {
      resend.disabled = true;
      const { ok, data } = await call('resend', { email: address });
      showToast(ok ? 'If the account isn\'t verified yet, a new email is on its way.' : (data.error || 'Try again later.'));
      setTimeout(() => { resend.disabled = false; }, 30000);
    });
    const back = el('p', 'acc-links');
    back.append(link('Back to log in', '#'));
    box.append(resend, back);
    root.replaceChildren(header('Almost done'), box);
  }

  // ---------- Forgot password
  function forgotView() {
    const box = el('div', 'pd-buybox acc-box acc-narrow');
    const form = el('form', 'wallet-form');
    form.noValidate = true;
    const [emailWrap, email] = field('Email', { type: 'email', autocomplete: 'email', required: true });
    const err = errorLine();
    const submit = el('button', 'shop-btn shop-btn--block', 'Send reset link');
    submit.type = 'submit';
    const links = el('p', 'acc-links');
    links.append(link('Back to log in', '#'));
    form.append(emailWrap, err, submit, links);
    box.append(form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) return void (err.textContent = 'Enter a valid email address.');
      busy(submit, true, 'Send reset link');
      const { ok, data } = await call('forgot', { email: email.value.trim() });
      if (!ok) {
        err.textContent = data.error || 'Try again later.';
        busy(submit, false, 'Send reset link');
        return;
      }
      box.replaceChildren(
        el('p', 'pd-price', 'Check your email'),
        el('p', null, 'If there\'s a CW PLAY account with that email, we\'ve sent a link to reset the password. It works for 1 hour.'),
        el('p', 'pd-note', 'Logged in with Discord before? Discord passwords can only be reset on Discord.'),
      );
    });
    root.replaceChildren(header('Reset your password', 'For CW PLAY accounts. Enter the email you signed up with.'), box);
  }

  // ---------- Links from emails
  async function verifyView(token) {
    root.replaceChildren(header('Verifying your email…'));
    const { ok, data } = await call('verify', { token });
    if (ok) return finish(data.token, 'Your email is verified. Welcome!');
    const box = el('div', 'pd-buybox acc-box acc-narrow');
    const back = el('p', 'acc-links');
    back.append(link('Go to log in', '#'));
    box.append(el('p', null, data.error || 'This link didn\'t work.'), back);
    root.replaceChildren(header('Couldn\'t verify'), box);
  }

  function resetView(token) {
    const box = el('div', 'pd-buybox acc-box acc-narrow');
    const form = el('form', 'wallet-form');
    form.noValidate = true;
    const [passWrap, pass] = field('New password', { type: 'password', autocomplete: 'new-password', required: true, placeholder: 'At least 8 characters' });
    const [againWrap, again] = field('Repeat new password', { type: 'password', autocomplete: 'new-password', required: true });
    const err = errorLine();
    const submit = el('button', 'shop-btn shop-btn--block', 'Save new password');
    submit.type = 'submit';
    form.append(passWrap, againWrap, err, submit);
    box.append(form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (pass.value.length < 8) return void (err.textContent = 'Use a password with at least 8 characters.');
      if (pass.value !== again.value) return void (err.textContent = 'The passwords don\'t match.');
      busy(submit, true, 'Save new password');
      const { ok, data } = await call('reset', { token, password: pass.value });
      if (ok) return finish(data.token, 'Your password was changed.');
      err.textContent = data.error || 'Couldn\'t change the password.';
      busy(submit, false, 'Save new password');
    });
    root.replaceChildren(header('Choose a new password'), box);
  }

  function loggedInView(login) {
    const box = el('div', 'pd-buybox acc-box acc-narrow');
    const store = el('a', 'shop-btn shop-btn--block', 'Go to the store');
    store.href = new URL('index.html#store', ROOT).href;
    const out = el('button', 'shop-btn shop-btn--ghost shop-btn--block', 'Log out');
    out.type = 'button';
    out.addEventListener('click', () => {
      sessionStorage.removeItem(LOGIN_KEY);
      route();
    });
    box.append(el('p', 'pd-price', `Logged in as ${login.u}`), store, out);
    root.replaceChildren(header('You\'re logged in'), box);
  }

  // ---------- Router
  const params = new URLSearchParams(window.location.search);
  const verifyToken = params.get('verify');
  const resetToken = params.get('reset');
  if (verifyToken || resetToken) {
    history.replaceState(null, '', window.location.pathname); // don't keep the token in the address bar
  }

  function route() {
    const view = window.location.hash.replace('#', '');
    if (view === 'register') return registerView();
    if (view === 'forgot') return forgotView();
    const login = readLogin();
    if (login) return loggedInView(login);
    return loginView();
  }

  if (verifyToken) verifyView(verifyToken);
  else if (resetToken) resetView(resetToken);
  else route();
  window.addEventListener('hashchange', route);
})();
