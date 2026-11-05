/* game.js - screens, saving and the game loop for Chain of Command */
(function () {
  'use strict';
  const C = window.GameCore;
  const CFG = Object.assign({ name: 'Recruit', theme: {} }, window.GAME_CONFIG || {});
  Object.entries(CFG.theme || {}).forEach(([k, v]) => document.documentElement.style.setProperty('--' + k, v));
  const SAVE_KEY = 'coc.save.v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; };

  /* ---------------- save / load ---------------- */
  function load() {
    const s = C.freshState();
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (raw) {
        Object.assign(s, raw);
        s.set = Object.assign(C.freshState().set, raw.set);
        while (s.units.length < C.UNITS.length) s.units.push(0);
      }
    } catch (e) { /* corrupt save: start fresh */ }
    return s;
  }
  let S = load();
  function save() { S.last = Date.now(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ } }

  /* ---------------- helpers ---------------- */
  const fmt = C.fmt;
  const rank = () => C.rankFor(S.medals);
  const callsign = () => rank().abbr + ' ' + CFG.name;
  let toastT;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
  }
  function buzz(ms) { if (S.set.haptics && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms || 8); }
  let actx;
  function beep(f, d) {
    if (!S.set.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square'; o.frequency.value = f || 520;
      g.gain.setValueAtTime(0.04, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (d || 0.07));
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + (d || 0.07) + 0.02);
    } catch (e) { /* no audio */ }
  }
  function gain(x) { S.sp += x; S.run += x; S.life += x; }
  function showModal(html, buttons) {
    const m = $('modal'); m.innerHTML = '';
    const box = el('div', 'box', html);
    const row = el('div'); row.style.cssText = 'display:flex;gap:10px;justify-content:center';
    buttons.forEach(([label, fn, cls]) => { const b = el('button', 'btn ' + (cls || ''), label); b.onclick = () => { m.hidden = true; if (fn) fn(); }; row.appendChild(b); });
    box.appendChild(row); m.appendChild(box); m.hidden = false;
  }

  /* ---------------- tabs ---------------- */
  let tab = 'drill';
  document.querySelectorAll('#nav button').forEach((b) => b.onclick = () => {
    tab = b.dataset.tab;
    document.querySelectorAll('#nav button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x.id === 'tab-' + tab));
    buzz(5);
    if (tab === 'command') buildCommand();
    if (tab === 'armory') buildUps(true);
    if (tab === 'ops') buildMissions(true);
  });

  /* ---------------- drill ---------------- */
  function doDrill(x, y) {
    const v = C.tapValue(S);
    gain(v); S.taps++;
    buzz(6); beep(620, 0.04);
    const f = el('div', 'floater', '+' + fmt(v));
    f.style.left = (x - 10) + 'px'; f.style.top = (y - 20) + 'px';
    document.body.appendChild(f); setTimeout(() => f.remove(), 800);
  }
  $('drill').addEventListener('pointerdown', (e) => { e.preventDefault(); doDrill(e.clientX, e.clientY); $('drill').classList.add('hit'); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => $('drill').addEventListener(ev, () => $('drill').classList.remove('hit')));
  document.addEventListener('keydown', (e) => {
    if (tab === 'drill' && (e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      const r = $('drill').getBoundingClientRect(); doDrill(r.left + r.width / 2, r.top + r.height / 2); e.preventDefault();
    }
  });

  /* ---------------- barracks ---------------- */
  const unitEls = [];
  const modes = [1, 10, 100, 'max'];
  function buildModes() {
    const box = $('modes'); box.innerHTML = '';
    modes.forEach((m) => {
      const b = el('button', 'chip' + (S.buy === m ? ' on' : ''), m === 'max' ? 'Max' : 'x' + m);
      b.onclick = () => { S.buy = m; buildModes(); updateUnits(); };
      box.appendChild(b);
    });
  }
  function buildUnits() {
    const box = $('units'); box.innerHTML = ''; unitEls.length = 0;
    C.UNITS.forEach((u, i) => {
      const card = el('button', 'card buyable');
      card.innerHTML = '<div class="emoji">' + u.emoji + '</div><div class="info"><b>' + u.name + '</b><small class="desc">' + u.desc + '</small><small class="rate"></small></div><div class="right"><div class="owned">0</div><div class="cost"></div></div>';
      card.onclick = () => buyUnit(i);
      box.appendChild(card);
      unitEls.push({ card, owned: card.querySelector('.owned'), cost: card.querySelector('.cost'), rate: card.querySelector('.rate') });
    });
  }
  function buyCount(i) {
    if (S.buy === 'max') return C.maxAffordable(i, S.units[i], S.sp);
    return S.buy;
  }
  function buyUnit(i) {
    const n = buyCount(i);
    if (n < 1) { buzz(3); return; }
    const cost = C.unitCost(i, S.units[i], n);
    if (cost > S.sp) { buzz(3); return; }
    S.sp -= cost; S.units[i] += n;
    buzz(10); beep(380, 0.08);
    updateUnits(); checkAch();
  }
  function updateUnits() {
    const per = (i) => C.UNITS[i].rate * C.unitMult(S, i) * C.globalMult(S);
    C.UNITS.forEach((u, i) => {
      const e = unitEls[i]; if (!e) return;
      const n = S.buy === 'max' ? Math.max(1, C.maxAffordable(i, S.units[i], S.sp)) : S.buy;
      const cost = C.unitCost(i, S.units[i], n);
      const can = cost <= S.sp;
      e.card.classList.toggle('can', can);
      e.owned.textContent = S.units[i];
      e.cost.textContent = (n > 1 ? 'x' + n + ' · ' : '') + fmt(Math.ceil(cost));
      e.rate.textContent = fmt(per(i), per(i) < 10 ? 1 : 0) + ' each/sec' + (S.units[i] ? ' · ' + fmt(per(i) * S.units[i]) + ' total' : '');
    });
  }

  /* ---------------- armory ---------------- */
  let upSig = '';
  function upVisible(u) {
    if (S.ups[u.id]) return false;
    if (u.req.unit !== undefined) return S.units[u.req.unit] >= u.req.owned;
    return S.run >= u.req.earned;
  }
  function buildUps(force) {
    const list = C.UPGRADES.filter(upVisible).sort((a, b) => a.cost - b.cost);
    const sig = list.map((u) => u.id).join(',');
    if (!force && sig === upSig) return;
    upSig = sig;
    const box = $('ups'); box.innerHTML = '';
    if (!list.length) { box.appendChild(el('div', 'empty', 'Nothing in the armory yet.<br>Keep drilling and recruiting, new gear unlocks as you grow.')); return; }
    box.appendChild(el('h3', '', 'Available gear'));
    list.forEach((u) => {
      const card = el('button', 'card buyable');
      card.dataset.id = u.id;
      card.innerHTML = '<div class="emoji">' + u.emoji + '</div><div class="info"><b>' + u.name + '</b><small>' + u.desc + '</small></div><div class="right"><div class="cost">' + fmt(u.cost) + '</div></div>';
      card.onclick = () => {
        if (S.sp < u.cost) { buzz(3); return; }
        S.sp -= u.cost; S.ups[u.id] = true; buzz(14); beep(300, 0.1);
        toast(u.name + ' acquired'); buildUps(true); updateUnits();
      };
      box.appendChild(card);
    });
    const owned = C.UPGRADES.filter((u) => S.ups[u.id]);
    if (owned.length) {
      box.appendChild(el('h3', '', 'Owned (' + owned.length + ')'));
      const p = el('div', 'panel'); p.style.cssText = 'font-size:13px;color:var(--dim);line-height:1.6';
      p.innerHTML = owned.map((u) => u.emoji + ' ' + u.name).join('<br>');
      box.appendChild(p);
    }
  }
  function updateUpAfford() {
    document.querySelectorAll('#ups .card').forEach((c) => {
      const u = C.UPGRADES.find((x) => x.id === c.dataset.id);
      if (u) c.classList.toggle('can', S.sp >= u.cost);
    });
  }

  /* ---------------- ops (missions) ---------------- */
  function buildMissions() {
    const box = $('missions'); box.innerHTML = '';
    box.appendChild(el('h3', '', 'Send your troops out'));
    C.MISSIONS.forEach((m) => {
      const unlocked = S.life >= m.unlock;
      const card = el('div', 'card'); card.style.flexWrap = 'wrap';
      const reward = C.missionReward(m, S);
      const active = S.mission && S.mission.id === m.id;
      card.innerHTML = '<div class="emoji">🗺️</div><div class="info"><b>' + m.name + '</b><small>' + (unlocked ? m.desc : 'Unlocks at ' + fmt(m.unlock) + ' total supplies earned') + '</small>' +
        (unlocked ? '<small style="color:var(--accent)">' + C.fmtTime(m.secs) + ' · reward about ' + fmt(reward) + '</small>' : '') + '</div><div class="right"></div>' +
        '<div class="bar" style="width:100%;display:' + (active ? 'block' : 'none') + '"><i></i></div>';
      const right = card.querySelector('.right');
      const btn = el('button', 'btn', 'Deploy');
      btn.disabled = !unlocked || !!S.mission;
      btn.onclick = () => { S.mission = { id: m.id, end: Date.now() + m.secs * 1000 }; buzz(12); beep(450, 0.1); buildMissions(); };
      right.appendChild(btn);
      card.dataset.id = m.id;
      box.appendChild(card);
    });
    updateMissions();
  }
  function updateMissions() {
    if (tab !== 'ops') return;
    document.querySelectorAll('#missions .card').forEach((card) => {
      const m = C.MISSIONS.find((x) => x.id === card.dataset.id);
      const bar = card.querySelector('.bar'), btn = card.querySelector('.btn'), fill = bar && bar.querySelector('i');
      if (!S.mission || S.mission.id !== m.id) return;
      const left = (S.mission.end - Date.now()) / 1000;
      if (left <= 0) {
        bar.style.display = 'none'; btn.textContent = 'Collect'; btn.disabled = false;
        btn.onclick = () => claimMission();
      } else {
        bar.style.display = 'block'; fill.style.width = (100 - (left / m.secs) * 100) + '%';
        btn.textContent = C.fmtTime(left); btn.disabled = true;
      }
    });
  }
  function claimMission() {
    const m = C.MISSIONS.find((x) => x.id === S.mission.id);
    const r = C.missionReward(m, S);
    gain(r); S.missionsDone++; S.mission = null;
    buzz(20); beep(700, 0.15); toast('Mission complete: +' + fmt(r) + ' supplies');
    buildMissions(); checkAch();
  }

  /* ---------------- command (promotion, stats, achievements, settings) ---------------- */
  function sw(label, key) {
    const row = el('div', 'setrow', '<span>' + label + '</span>');
    const l = el('label', 'sw'), i = el('input'); i.type = 'checkbox'; i.checked = !!S.set[key];
    i.onchange = () => { S.set[key] = i.checked; save(); if (i.checked) { buzz(15); beep(500, 0.1); } };
    l.appendChild(i); l.appendChild(el('i')); row.appendChild(l);
    return row;
  }
  function buildCommand() {
    const box = $('command'); box.innerHTML = '';
    const nr = C.nextRank(S.medals);
    const gainM = C.promotionGain(S.run);
    box.appendChild(el('h3', '', 'Promotion'));
    const p = el('div', 'panel');
    p.innerHTML = '<div class="promo-big"><b>' + callsign() + '</b> · ' + S.medals + ' medals · +' + Math.round(S.medals * C.MEDAL_BONUS * 100) + '% to everything<br>' +
      (nr ? '<span class="dim">Next rank: ' + nr.title + ' at ' + nr.medals + ' medals</span>' : '<span class="dim">Highest rank reached. Legend.</span>') + '<br><br>' +
      (gainM >= 1 ? 'Ready to be promoted for <b style="color:var(--accent)">+' + gainM + ' medal' + (gainM > 1 ? 's' : '') + '</b>.' : 'Earn <b>' + fmt(C.PROMO_DIV) + '</b> supplies in one tour to earn your first medal (this tour: ' + fmt(S.run) + ').') +
      '<br><span class="dim" style="font-size:13px">Promotion resets your supplies, troops and gear. You keep your medals, achievements and rank.</span></div>';
    const pb = el('button', 'btn', 'Get promoted'); pb.disabled = gainM < 1;
    pb.onclick = () => showModal('<h2>Request promotion?</h2>You will gain <b>' + gainM + '</b> medal' + (gainM > 1 ? 's' : '') + ' and start a new tour from the bottom.', [['Not yet', null, 'ghost'], ['Promote me', doPromote]]);
    p.appendChild(pb); box.appendChild(p);

    box.appendChild(el('h3', '', 'Service record'));
    const st = el('div', 'panel');
    const stat = (a, b) => '<div class="stat"><span>' + a + '</span><b>' + b + '</b></div>';
    st.innerHTML = stat('Supplies per second', fmt(C.sps(S))) + stat('Per drill', fmt(C.tapValue(S))) + stat('Total earned', fmt(S.life)) + stat('Drills', S.taps.toLocaleString()) + stat('Promotions', S.promos) + stat('Missions done', S.missionsDone) + stat('Crates caught', S.crates);
    box.appendChild(st);

    box.appendChild(el('h3', '', 'Achievements (' + C.achCount(S) + '/' + C.ACHIEVEMENTS.length + ', +' + Math.round(C.achCount(S) * C.ACH_BONUS * 100) + '%)'));
    const grid = el('div', 'achs');
    C.ACHIEVEMENTS.forEach((a) => {
      const done = !!S.ach[a.id];
      grid.appendChild(el('div', 'ach ' + (done ? 'done' : 'locked'), '<b>' + (done ? '★ ' : '') + a.name + '</b>' + a.desc));
    });
    box.appendChild(grid);

    box.appendChild(el('h3', '', 'Dispatch log'));
    const log = el('div', 'panel log');
    log.innerHTML = S.log.length ? S.log.slice().reverse().map((t) => '<div>' + t + '</div>').join('') : '<div>Nothing yet.</div>';
    box.appendChild(log);

    box.appendChild(el('h3', '', 'Settings'));
    const set = el('div', 'panel');
    set.appendChild(sw('Vibration', 'haptics')); set.appendChild(sw('Sound effects', 'sound'));
    const r1 = el('div', 'setrow', '<span>Save to clipboard</span>');
    const exp = el('button', 'btn ghost', 'Export'); exp.onclick = () => {
      save(); const code = btoa(unescape(encodeURIComponent(JSON.stringify(S))));
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => toast('Save copied. Paste it on your other device.'), () => toast('Clipboard blocked'));
    };
    r1.appendChild(exp); set.appendChild(r1);
    const r2 = el('div', 'setrow', '<span>Load a saved code</span>');
    const imp = el('button', 'btn ghost', 'Import'); imp.onclick = () => {
      const code = prompt('Paste your save code:'); if (!code) return;
      try { const d = JSON.parse(decodeURIComponent(escape(atob(code.trim())))); if (!Array.isArray(d.units)) throw 0; localStorage.setItem(SAVE_KEY, JSON.stringify(d)); location.reload(); } catch (e) { toast('That code did not work'); }
    };
    r2.appendChild(imp); set.appendChild(r2);
    const r3 = el('div', 'setrow', '<span>Erase everything</span>');
    const rst = el('button', 'btn danger', 'Reset'); rst.onclick = () => showModal('<h2>Erase all progress?</h2>This cannot be undone.', [['Cancel', null, 'ghost'], ['Erase', () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } location.reload(); }, 'danger']]);
    r3.appendChild(rst); set.appendChild(r3);
    box.appendChild(set);
  }
  function doPromote() {
    const g = C.promotionGain(S.run); if (g < 1) return;
    const before = rank();
    S.medals += g; S.promos++;
    S.sp = 0; S.run = 0; S.units = C.UNITS.map(() => 0); S.ups = {}; S.mission = null;
    const after = rank();
    addLog(after !== before ? 'Promoted to ' + after.title + '. The paperwork alone took three weeks.' : 'Another tour complete. Medals polished.');
    buzz([30, 40, 30]); beep(800, 0.2);
    toast(after !== before ? 'Promoted to ' + after.title + '!' : '+' + g + ' medals');
    checkAch(); save(); buildUnits(); buildUps(true); buildMissions(); buildCommand(); updateUnits();
  }

  /* ---------------- story + achievements ---------------- */
  function addLog(t) { S.log.push(t); if (S.log.length > 40) S.log.shift(); $('dispatch').textContent = t; }
  function checkDispatch() {
    let idx = -1;
    C.DISPATCHES.forEach((d, i) => { if (S.life >= d.at) idx = i; });
    if (idx > S.seen - 1 && idx >= S.seen) {
      for (let i = S.seen; i <= idx; i++) S.log.push(C.DISPATCHES[i].t);
      S.seen = idx + 1; $('dispatch').textContent = C.DISPATCHES[idx].t;
      if (S.log.length > 40) S.log.splice(0, S.log.length - 40);
    }
  }
  function checkAch() {
    C.ACHIEVEMENTS.forEach((a) => {
      if (!S.ach[a.id] && a.test(S)) { S.ach[a.id] = Date.now(); toast('★ Achievement: ' + a.name); buzz([15, 30, 15]); beep(900, 0.15); }
    });
  }

  /* ---------------- supply crates ---------------- */
  function scheduleCrate() { setTimeout(() => { spawnCrate(); scheduleCrate(); }, (50 + Math.random() * 70) * 1000); }
  function spawnCrate() {
    if (document.hidden || !$('modal').hidden) return;
    const c = el('button', 'crate', '📦');
    c.style.left = (8 + Math.random() * 72) + 'vw'; c.style.top = (22 + Math.random() * 50) + 'vh';
    c.onpointerdown = (e) => {
      e.preventDefault();
      const r = Math.max(40, C.sps(S) * 90 + C.tapValue(S) * 20);
      gain(r); S.crates++; buzz(25); beep(760, 0.15); toast('Supply drop! +' + fmt(r)); c.remove(); checkAch();
    };
    document.body.appendChild(c); setTimeout(() => c.remove(), 12000);
  }

  /* ---------------- main loop ---------------- */
  function awayText(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h ? h + ' hr' + (m ? ' ' + m + ' min' : '') : m + ' min';
  }
  function awayModal(secs, earned) {
    const m = S.mission && S.mission.end <= Date.now() ? '<br>Your mission team is back and waiting in Ops.' : '';
    showModal('<h2>Welcome back, ' + callsign() + '</h2>Gone for ' + awayText(secs) + '. Your troops stood guard at half pace and earned<div class="big">+' + fmt(earned) + '</div>' + m, [['At ease', null]]);
  }
  let lastRender = 0;
  function tick() {
    const now = Date.now();
    let dt = (now - S.last) / 1000;
    S.last = now;
    if (dt > 3) {
      const secs = Math.min(dt, C.OFFLINE_CAP_HOURS * 3600);
      const earned = C.sps(S) * secs * C.OFFLINE_EFFICIENCY;
      gain(earned);
      if (dt > 60 && earned > 0) awayModal(dt, earned);
    } else if (dt > 0) gain(C.sps(S) * dt);
    updateHeader(); updateUnits(); updateUpAfford(); updateMissions();
    if (now - lastRender > 1000) {
      lastRender = now;
      checkDispatch(); checkAch(); buildUps(false);
      if (tab === 'command') { const sc = $('tab-command').scrollTop; buildCommand(); $('tab-command').scrollTop = sc; }
      if (tab === 'ops') { /* keep reward text fresh without wiping the buttons */ }
    }
  }
  function updateHeader() {
    $('rank').textContent = callsign();
    $('sp').textContent = fmt(S.sp);
    $('sps').textContent = fmt(C.sps(S), C.sps(S) < 10 ? 1 : 0) + ' supplies / sec';
    $('tapval').textContent = '+' + fmt(C.tapValue(S)) + ' per drill';
    $('quick').textContent = S.mission ? (S.mission.end <= Date.now() ? 'A mission is ready to collect in Ops.' : 'Mission underway: ' + C.fmtTime((S.mission.end - Date.now()) / 1000)) : 'Tip: crates drop in now and then. Tap them fast.';
  }

  /* ---------------- start ---------------- */
  buildModes(); buildUnits(); buildUps(true); buildMissions();
  if (!S.log.length) { S.log.push(C.DISPATCHES[0].t); S.seen = 1; }
  $('dispatch').textContent = S.log[S.log.length - 1];
  tick();
  setInterval(tick, 100);
  setInterval(save, 5000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else tick(); });
  window.addEventListener('pagehide', save);
  scheduleCrate();
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
})();
