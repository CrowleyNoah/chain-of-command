/* Cloud save: signs you in with an emailed code and keeps a copy of your data online (Supabase).
   After a wipe, a reinstall or a new phone: sign in and your data comes back. Works offline; syncs when it can. */
(function () {
  'use strict';
  const GID = '599398618418-g1ealk0av3so5o712b92mpgjho0c43s1.apps.googleusercontent.com';   // Google OAuth Client ID (public). When set, Google's own button is used and shows the app name.
  const URL_ = 'https://qbdjpmnvuedmigkobuat.supabase.co', KEY = 'sb_publishable_Qeu0RmUdyZ92Uzao6yk_HA_poFmQHH_';
  const SK = 'cloud.session', DAY = 'cloud.dismissed';
  let O = null, sess = null, busy = false, lastPushed = null, stamp = 0, state = '', timer = null;
  const configured = () => KEY && KEY.indexOf('PASTE') !== 0;
  try { sess = JSON.parse(localStorage.getItem(SK)); } catch (e) { sess = null; }
  const store = (s) => { sess = s; try { if (s) localStorage.setItem(SK, JSON.stringify(s)); else localStorage.removeItem(SK); } catch (e) { /* ignore */ } };
  const mk = (j) => ({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), email: (j.user && j.user.email) || (sess && sess.email) || '', uid: (j.user && j.user.id) || (sess && sess.uid) || '' });
  async function api(path, opts) {
    const r = await fetch(URL_ + path, opts), t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* not json */ }
    if (!r.ok) { const er = new Error((j && (j.msg || j.message || j.error_description || j.error)) || 'Error ' + r.status); er.status = r.status; throw er; }
    return j;
  }
  async function token() {
    if (!sess) return null;
    if (Date.now() / 1000 > sess.expires_at - 60) {
      try { store(mk(await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: sess.refresh_token }) }))); }
      catch (e) { if (e.status >= 400 && e.status < 500) store(null); throw e; }
    }
    return sess.access_token;
  }
  const hdr = (t) => ({ apikey: KEY, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' });
  async function pull() { const t = await token(); const rows = await api('/rest/v1/saves?app=eq.' + O.app + '&select=data,updated_at', { headers: hdr(t) }); return rows && rows[0] ? { s: rows[0].data && rows[0].data.s, at: rows[0].updated_at } : null; }
  async function push(str) {
    const t = await token();
    await api('/rest/v1/saves?on_conflict=user_id,app', { method: 'POST', headers: Object.assign(hdr(t), { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify([{ user_id: sess.uid, app: O.app, data: { s: str }, updated_at: new Date().toISOString() }]) });
  }
  async function sync() {
    if (!sess || busy || !configured() || !O) return;
    const cur = O.read(); if (!cur || cur === lastPushed) return;
    busy = true;
    try { await push(cur); lastPushed = cur; stamp = Date.now(); state = 'ok'; } catch (e) { state = 'err'; }
    busy = false; paint();
  }
  function fresh(s) { return !s || O.score(s) < 120; }
  async function reconcile(ui) {   // after sign-in or at start: bring the two copies together
    const cloud = await pull(), local = O.read();
    if (!cloud || !cloud.s) { if (local) { await push(local); lastPushed = local; stamp = Date.now(); state = 'ok'; } return 'pushed'; }
    if (cloud.s === local) { lastPushed = local; state = 'ok'; stamp = Date.now(); return 'same'; }
    if (fresh(local) && O.score(cloud.s) > O.score(local)) {
      let done = null; try { done = sessionStorage.getItem('cl.restored'); sessionStorage.setItem('cl.restored', '1'); } catch (e) { /* ignore */ }
      if (!done) { O.write(cloud.s); lastPushed = cloud.s; location.reload(); return 'restored'; }
    }
    if (fresh(cloud.s) || O.score(local) >= O.score(cloud.s)) { await push(local); lastPushed = local; state = 'ok'; stamp = Date.now(); return 'pushed'; }
    return ui ? { choose: cloud } : 'conflict';
  }
  /* ---------- tiny UI ---------- */
  const css = '#cl-bn{position:fixed;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 74px);z-index:99998;background:#1a2a44;color:#fff;border:1px solid #4aa3ff;border-radius:12px;padding:10px 12px;font:600 14px system-ui,sans-serif;display:flex;gap:8px;align-items:center}#cl-bn button{font:inherit;border:0;border-radius:8px;padding:8px 12px;background:#4aa3ff;color:#06121f}#cl-bn .x{background:transparent;color:#fff;padding:8px}#cl-bn span{flex:1}' +
    '#cl-m{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:16px}#cl-m>div{background:#101826;color:#fff;border:1px solid #2c3e5c;border-radius:16px;padding:18px;width:100%;max-width:360px;font:500 15px system-ui,sans-serif}#cl-m h3{margin:0 0 6px;font-size:18px}#cl-m p{margin:6px 0 10px;opacity:.8;font-size:13px}#cl-m input{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #2c3e5c;background:#0a1220;color:#fff;font-size:18px;margin-bottom:8px}#cl-m button{width:100%;padding:12px;border:0;border-radius:10px;background:#4aa3ff;color:#06121f;font:700 15px system-ui,sans-serif;margin-top:6px}#cl-m button.g{background:#26354f;color:#fff}#cl-m .e{color:#ff8a80;min-height:18px;font-size:13px}';
  function el(h) { const d = document.createElement('div'); d.innerHTML = h; return d.firstChild; }
  function ensureCss() { if (!document.getElementById('cl-css')) { const s = document.createElement('style'); s.id = 'cl-css'; s.textContent = css; document.head.appendChild(s); } }
  function paint() { const s = document.getElementById('cl-status'); if (s) s.textContent = statusText(); }
  function statusText() { if (!sess) return 'Not signed in'; return 'Signed in as ' + sess.email + (state === 'err' ? ' · offline, will retry' : stamp ? ' · saved ' + new Date(stamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''); }
  function close() { const m = document.getElementById('cl-m'); if (m) m.remove(); }
  function modal(html) { ensureCss(); close(); const m = el('<div id="cl-m"><div>' + html + '</div></div>'); document.body.appendChild(m); return m; }
  function open() {
    if (!configured()) { modal('<h3>Cloud save</h3><p>Not set up yet.</p><button id="cl-x">OK</button>').querySelector('#cl-x').onclick = close; return; }
    if (sess) {
      const m = modal('<h3>Cloud save</h3><p id="cl-status">' + statusText() + '</p><button id="cl-now">Save now</button><button id="cl-get" class="g">Load cloud save</button><button id="cl-out" class="g">Sign out</button><button id="cl-x" class="g">Close</button><div class="e" id="cl-e"></div>');
      m.querySelector('#cl-x').onclick = close;
      m.querySelector('#cl-now').onclick = async () => { lastPushed = null; await sync(); paint(); };
      m.querySelector('#cl-get').onclick = async () => { try { const c = await pull(); if (!c || !c.s) { m.querySelector('#cl-e').textContent = 'Nothing saved online yet.'; return; } if (confirm('Replace this device with the cloud save?\nCloud: ' + O.describe(c.s) + '\nThis device: ' + O.describe(O.read()))) { O.write(c.s); lastPushed = c.s; location.reload(); } } catch (e) { m.querySelector('#cl-e').textContent = e.message; } };
      m.querySelector('#cl-out').onclick = () => { if (confirm('Sign out? Your data stays on this device and online.')) { store(null); close(); banner(); } };
      return;
    }
    const m = modal('<h3>Sign in</h3><p>Back up your data online.</p><div id="cl-gb" style="min-height:44px;display:flex;justify-content:center"></div><button id="cl-g">Continue with Google</button><button id="cl-x" class="g">Cancel</button>');
    m.querySelector('#cl-x').onclick = close;
    const redirect = () => { location.href = URL_ + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(location.origin + location.pathname); };
    m.querySelector('#cl-g').onclick = redirect;
    if (GID) gsi(m, redirect);
  }
  function loadGsi() {
    return new Promise((res, rej) => {
      if (window.google && google.accounts && google.accounts.id) return res();
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  async function fromIdToken(cred) {
    store(mk(await api('/auth/v1/token?grant_type=id_token', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'google', id_token: cred }) })));
    await finishSignIn();
  }
  function gsi(m) {   // Google's own button: shows your app name instead of the Supabase address
    loadGsi().then(() => {
      google.accounts.id.initialize({ client_id: GID, callback: (r) => { fromIdToken(r.credential).catch((e) => { const er = m.querySelector('#cl-gb'); if (er) er.textContent = e.message; }); }, use_fedcm_for_prompt: true });
      const box = m.querySelector('#cl-gb'); if (!box) return;
      google.accounts.id.renderButton(box, { theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'pill', width: 280 });
      const fb = m.querySelector('#cl-g'); if (fb) fb.style.display = 'none';
    }).catch(() => { /* keep the redirect button */ });
  }
  window.addEventListener('storage', (e) => { if (e.key === SK && e.newValue && !sess) { try { sess = JSON.parse(e.newValue); } catch (x) { return; } finishSignIn(); } });
  async function finishSignIn() {
    try { const r = await reconcile(true); if (r && r.choose) return choose(r.choose); } catch (e) { state = 'err'; }
    const b = document.getElementById('cl-bn'); if (b) b.remove(); start();
    modal('<h3>Signed in ✓</h3><p>' + String((sess && sess.email) || '').replace(/[<>]/g, '') + '</p><button id="cl-x">OK</button>').querySelector('#cl-x').onclick = close;
  }
  async function fromLink() {   // the email link brings you back here with the sign-in in the address
    const h = location.hash || ''; if (h.indexOf('access_token=') < 0 && h.indexOf('error_description=') < 0) return false;
    const q = new URLSearchParams(h.replace(/^#/, ''));
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    if (q.get('error_description')) { modal('<h3>Sign-in failed</h3><p>' + q.get('error_description').replace(/[<>]/g, '') + '</p><button id="cl-x">OK</button>').querySelector('#cl-x').onclick = close; return true; }
    try {
      const u = await api('/auth/v1/user', { headers: { apikey: KEY, Authorization: 'Bearer ' + q.get('access_token') } });
      store({ access_token: q.get('access_token'), refresh_token: q.get('refresh_token'), expires_at: +q.get('expires_at') || Math.floor(Date.now() / 1000) + (+q.get('expires_in') || 3600), email: u.email || '', uid: u.id });
      await finishSignIn();
    } catch (e) { modal('<h3>Sign-in failed</h3><p>' + String(e.message).replace(/[<>]/g, '') + '</p><button id="cl-x">OK</button>').querySelector('#cl-x').onclick = close; }
    return true;
  }
  function choose(cloud) {
    const m = modal('<h3>Which save?</h3><p>Cloud: ' + O.describe(cloud.s).replace(/</g, '') + '<br>This device: ' + O.describe(O.read()).replace(/</g, '') + '</p><button id="cl-c">Use cloud save</button><button id="cl-l" class="g">Keep this device</button>');
    m.querySelector('#cl-c').onclick = () => { O.write(cloud.s); lastPushed = cloud.s; location.reload(); };
    m.querySelector('#cl-l').onclick = async () => { try { await push(O.read()); lastPushed = O.read(); stamp = Date.now(); state = 'ok'; } catch (e) { state = 'err'; } close(); start(); };
  }
  function banner() {
    if (!configured() || sess || document.getElementById('cl-bn')) return;
    let d = null; try { d = sessionStorage.getItem(DAY); } catch (e) { /* ignore */ }
    if (d) return; ensureCss();
    const b = el('<div id="cl-bn"><span>' + (fresh(O.read()) ? 'Sign in with Google to restore your save' : 'Sign in with Google to back up your save') + '</span><button id="cl-si">Sign in</button><button class="x" id="cl-no" aria-label="Dismiss">✕</button></div>');
    document.body.appendChild(b);
    b.querySelector('#cl-si').onclick = open; b.querySelector('#cl-no').onclick = () => { try { sessionStorage.setItem(DAY, '1'); } catch (e) { /* ignore */ } b.remove(); };
  }
  function start() {
    if (timer) clearInterval(timer);
    if (!sess || !configured()) return;
    reconcile(false).then((r) => { if (r === 'conflict') { pull().then(choose).catch(() => {}); } }).catch(() => { state = 'err'; });
    timer = setInterval(() => { if (!document.hidden) sync(); }, 60000);
  }
  function init(o) {
    O = o;
    document.addEventListener('visibilitychange', () => { if (document.hidden) sync(); else if (sess) token().catch(() => {}); });
    window.addEventListener('pagehide', sync);
    window.addEventListener('hashchange', () => { fromLink(); });
    const go = () => { fromLink().then((used) => { if (!used) { banner(); start(); } }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
  window.Cloud = { _idToken: fromIdToken, init, open, sync: () => sync(), signedIn: () => !!sess };
})();
