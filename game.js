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
        s.daily = Object.assign(C.freshState().daily, raw.daily);
        s.perks = Object.assign({}, raw.perks);
        if (raw.honors === undefined) s.honors = raw.medals || 0; // saves from before the Honors shop
      }
    } catch (e) { /* corrupt save: start fresh */ }
    return s;
  }
  let S = load();
  if (window.Cloud) Cloud.init({
    app: 'chain-of-command',
    read: () => { try { return localStorage.getItem(SAVE_KEY); } catch (e) { return null; } },
    write: (s) => { window.cocNoSave = true; try { localStorage.setItem(SAVE_KEY, s); } catch (e) { /* ignore */ } },
    score: (s) => { try { const o = JSON.parse(s); return (o.playSecs || 0) + (o.taps || 0) / 10; } catch (e) { return 0; } },
    describe: (s) => { try { const o = JSON.parse(s); return (o.medals || 0) + ' medals, ' + (o.promos || 0) + ' promotions'; } catch (e) { return 'empty'; } }
  });
  function save() { if (window.cocNoSave) return; S.last = Date.now(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ } }

  /* ---------------- themes ---------------- */
  const THEMES = {
    default: null,
    olive:    { bg: '#0a0e09', panel: '#121a10', panel2: '#1a2517', line: '#26351f', text: '#e9edd9', dim: '#8d9a78', accent: '#9bbf3a', accentText: '#0b1205', tan: '#d9c68f', danger: '#d9644a' },
    desert:   { bg: '#14100a', panel: '#1e1810', panel2: '#2a2216', line: '#3a3020', text: '#f1e8d0', dim: '#a39673', accent: '#e0a93b', accentText: '#1a1204', tan: '#e8d7a8', danger: '#d9644a' },
    navy:     { bg: '#070b14', panel: '#0e1626', panel2: '#15213a', line: '#1f2f4d', text: '#e3ebf7', dim: '#7d90b0', accent: '#4aa3ff', accentText: '#04101f', tan: '#b7cdee', danger: '#e0645a' },
    arctic:   { bg: '#0b1113', panel: '#121d20', panel2: '#1a2a2e', line: '#25393e', text: '#e6f3f4', dim: '#84a3a8', accent: '#5fd1cf', accentText: '#04191a', tan: '#bfe3e0', danger: '#e0735a' },
    midnight: { bg: '#0a0a0a', panel: '#141414', panel2: '#1d1d1d', line: '#2b2b2b', text: '#ececec', dim: '#8a8a8a', accent: '#e0443a', accentText: '#1a0402', tan: '#d8b9a0', danger: '#ff7a6a' }
  };
  const THEME_NAMES = { default: 'Vivid', olive: 'Olive', desert: 'Desert', navy: 'Navy', arctic: 'Arctic', midnight: 'Midnight' };
  function applyLook() {
    const th = THEMES[S.set.theme] || CFG.theme || {};
    Object.entries(th).forEach(([k, v]) => document.documentElement.style.setProperty('--' + k, v));
    const m = document.querySelector('meta[name=theme-color]'); if (m && th.bg) m.content = th.bg;
    document.body.classList.toggle('compact', !!S.set.compact);
  }

  /* ---------------- helpers ---------------- */
  const fmt = C.fmt;
  const rank = () => C.rankFor(S.medals);
  const callsign = () => rank().abbr + ' ' + CFG.name;
  let toastT;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
  }
  const HSCALE = [0, 0.6, 1, 1.8];
  function buzz(ms) {
    if (!S.set.haptics || !navigator.vibrate || (navigator.userActivation && !navigator.userActivation.hasBeenActive)) return;
    const k = HSCALE[S.set.hlevel] || 1, v = ms || 8;
    navigator.vibrate(Array.isArray(v) ? v.map((x) => Math.round(x * k)) : Math.round(v * k));
  }
  const PACKS = { arcade: { type: 'square', g: 0.04, p: 1 }, soft: { type: 'sine', g: 0.1, p: 0.9 }, radio: { type: 'sawtooth', g: 0.03, p: 0.75 }, tactical: { type: 'triangle', g: 0.09, p: 0.6 } };
  let actx;
  function beep(f, d) {
    if (!S.set.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      const pk = PACKS[S.set.pack] || PACKS.arcade;
      o.type = pk.type; o.frequency.value = (f || 520) * pk.p;
      g.gain.setValueAtTime(Math.max(0.0002, pk.g * (S.set.vol / 0.6)), actx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (d || 0.07));
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + (d || 0.07) + 0.02);
    } catch (e) { /* no audio */ }
  }
  function gain(x) { S.sp += x; S.run += x; S.life += x; }
  const modalQueue = [];
  function showModal(html, buttons) {
    const m = $('modal');
    if (!m.hidden) { modalQueue.push([html, buttons]); return; }
    m.innerHTML = '';
    const box = el('div', 'box', html);
    const row = el('div'); row.style.cssText = 'display:flex;gap:10px;justify-content:center';
    buttons.forEach(([label, fn, cls]) => { const b = el('button', 'btn ' + (cls || ''), label); b.onclick = () => { m.hidden = true; if (fn) fn(); if (m.hidden && modalQueue.length) { const n = modalQueue.shift(); showModal(n[0], n[1]); } }; row.appendChild(b); });
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
  const modes = [1, 10, 100, 'next', 'max'];
  const disc = () => C.costMult(S);
  function buildModes() {
    const box = $('modes'); box.innerHTML = '';
    modes.forEach((m) => {
      const b = el('button', 'chip' + (S.buy === m ? ' on' : ''), m === 'max' ? 'Max' : m === 'next' ? 'Next' : 'x' + m);
      b.onclick = () => { S.buy = m; buildModes(); updateUnits(); };
      box.appendChild(b);
    });
  }
  function buildUnits() {
    const box = $('units'); box.innerHTML = ''; unitEls.length = 0;
    C.UNITS.forEach((u, i) => {
      const card = el('button', 'card buyable'); card.style.setProperty('--h', (i * 36 + 100) % 360);
      card.innerHTML = '<i class="fill"></i><div class="emoji">' + u.emoji + '</div><div class="info"><b>' + u.name + '</b><small class="desc">' + u.desc + '</small><small class="rate"></small><small class="ms"></small><div class="msbar"><i></i></div></div><div class="right"><div class="owned">0</div><div class="cost"></div></div>';
      card.onclick = () => buyUnit(i);
      box.appendChild(card);
      unitEls.push({ fill: card.querySelector('.fill'), card, owned: card.querySelector('.owned'), cost: card.querySelector('.cost'), rate: card.querySelector('.rate'), ms: card.querySelector('.ms'), msbar: card.querySelector('.msbar i') });
    });
  }
  function buyCount(i) {
    if (S.buy === 'max') return C.maxAffordable(i, S.units[i], S.sp, disc());
    if (S.buy === 'next') { const m = C.nextMilestone(S.units[i]); return m ? m - S.units[i] : 1; }
    return S.buy;
  }
  function addUnits(i, n) {
    const before = S.units[i]; S.units[i] += n;
    C.MILESTONES.filter((m) => before < m && S.units[i] >= m).forEach((m) => celebrate(i, m));
  }
  function celebrate(i, m) {
    S.milestones++;
    toast('🎉 ' + m + ' ' + C.UNITS[i].plural + '! They now work twice as fast.');
    buzz([20, 40, 20, 40, 40]); beep(520, 0.1); setTimeout(() => beep(660, 0.1), 90); setTimeout(() => beep(880, 0.2), 180);
    const e = unitEls[i]; if (e) { e.card.classList.remove('celebrate'); void e.card.offsetWidth; e.card.classList.add('celebrate'); }
  }
  function buyUnit(i) {
    const n = buyCount(i);
    if (n < 1) { buzz(3); return; }
    const cost = C.unitCost(i, S.units[i], n, disc());
    if (cost > S.sp) { buzz(3); return; }
    S.sp -= cost; addUnits(i, n);
    buzz(10); beep(380, 0.08);
    updateUnits(); checkAch();
  }
  let lastAuto = 0;
  function autoBuy() {
    if (!C.perkLvl(S, 'auto') || !S.set.autoBuy) return;
    for (let k = 0; k < 5; k++) {
      let best = null;
      C.UNITS.forEach((u, i) => {
        const cost = C.unitCost(i, S.units[i], 1, disc());
        if (cost > S.sp * 0.4) return;
        const score = cost / (u.rate * C.unitMult(S, i));
        if (!best || score < best.score) best = { i, cost, score };
      });
      if (!best) break;
      S.sp -= best.cost; addUnits(best.i, 1);
    }
  }
  function updateUnits() {
    const per = (i) => C.UNITS[i].rate * C.unitMult(S, i) * C.globalMult(S);
    C.UNITS.forEach((u, i) => {
      const e = unitEls[i]; if (!e) return;
      const n = S.buy === 'max' ? Math.max(1, C.maxAffordable(i, S.units[i], S.sp, disc())) : buyCount(i);
      const cost = C.unitCost(i, S.units[i], n, disc());
      const can = cost <= S.sp;
      e.card.classList.toggle('can', can); e.fill.style.width = Math.min(100, S.sp / Math.max(1, cost) * 100).toFixed(0) + '%';
      e.owned.textContent = S.units[i];
      e.cost.textContent = (n > 1 ? 'x' + n + ' · ' : '') + fmt(Math.ceil(cost));
      e.rate.textContent = fmt(per(i), per(i) < 10 ? 1 : 0) + ' each/sec' + (S.units[i] ? ' · ' + fmt(per(i) * S.units[i]) + ' total' : '');
      const nm = C.nextMilestone(S.units[i]);
      const prev = C.MILESTONES.filter((m) => m <= S.units[i]).pop() || 0;
      e.ms.textContent = nm ? 'Next bonus at ' + nm + ' owned (' + (nm - S.units[i]) + ' to go): 2x speed' : 'Every bonus earned';
      e.msbar.style.width = (nm ? (S.units[i] - prev) / (nm - prev) * 100 : 100) + '%';
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
  function claimMission(quiet) {
    const m = C.MISSIONS.find((x) => x.id === S.mission.id);
    const r = C.missionReward(m, S);
    gain(r); S.missionsDone++; S.mission = null;
    if (!quiet) { buzz(20); beep(700, 0.15); toast('Mission complete: +' + fmt(r) + ' supplies'); }
    if (quiet && S.set.autoMission) S.mission = { id: m.id, end: Date.now() + m.secs * 1000 };
    buildMissions(); checkAch();
  }

  /* ---------------- command (promotion, honors shop, records, settings) ---------------- */
  let cmdPane = 'promo';
  const fmtDur = (sec) => { sec = Math.floor(sec); const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60); return d ? d + 'd ' + h + 'h' : h ? h + 'h ' + m + 'm' : m + 'm ' + (sec % 60) + 's'; };
  function chips(opts, cur, pick, cls) {
    const row = el('div', 'chiprow ' + (cls || ''));
    opts.forEach(([val, label]) => { const b = el('button', 'chip' + (cur === val ? ' on' : ''), label); b.onclick = () => pick(val); row.appendChild(b); });
    return row;
  }
  function sw(label, key, after) {
    const row = el('div', 'setrow', '<span>' + label + '</span>');
    const l = el('label', 'sw'), i = el('input'); i.type = 'checkbox'; i.checked = !!S.set[key];
    i.onchange = () => { S.set[key] = i.checked; save(); if (after) after(); if (i.checked) { buzz(15); beep(500, 0.1); } };
    l.appendChild(i); l.appendChild(el('i')); row.appendChild(l);
    return row;
  }
  function buildCommand() {
    const box = $('command'); box.innerHTML = '';
    const panes = [['promo', 'Promotion'], ['shop', 'Honors' + (S.honors - S.honorsSpent > 0 ? ' (' + (S.honors - S.honorsSpent) + ')' : '')], ['records', 'Records'], ['set', 'Settings']];
    box.appendChild(chips(panes, cmdPane, (v) => { cmdPane = v; buildCommand(); $('tab-command').scrollTop = 0; }, 'panes'));
    ({ promo: panePromo, shop: paneShop, records: paneRecords, set: paneSettings })[cmdPane](box);
  }
  function paneStatic() { return cmdPane === 'promo' || cmdPane === 'records'; }
  function paneShop(box) {
    const avail = S.honors - S.honorsSpent;
    box.appendChild(el('h3', '', 'Honors shop'));
    box.appendChild(el('div', 'panel', '<div class="promo-big">Honors available: <b style="color:var(--accent)">' + avail + '</b><br><span class="dim" style="font-size:13px">You earn Honors every time you are promoted (as many as the medals you gain). Perks are permanent and survive promotions. Medals still give you +10% each as before.</span></div>'));
    C.PERKS.forEach((pk) => {
      const lvl = C.perkLvl(S, pk.id), maxed = lvl >= pk.max;
      const cost = maxed ? 0 : pk.cost(lvl);
      const card = el('div', 'card perk');
      const pips = pk.max > 1 ? '<span class="pips">' + Array.from({ length: pk.max }, (_, k) => '<i class="' + (k < lvl ? 'on' : '') + '"></i>').join('') + '</span>' : '';
      card.innerHTML = '<div class="emoji">' + pk.emoji + '</div><div class="info"><b>' + pk.name + pips + '</b><small>' + (maxed ? pk.desc(lvl - 1) : pk.desc(lvl)) + '</small></div>';
      const right = el('div', 'right');
      const btn = el('button', 'btn', maxed ? 'Owned' : cost + ' Honor' + (cost > 1 ? 's' : ''));
      btn.disabled = maxed || avail < cost;
      btn.onclick = () => { S.honorsSpent += cost; S.perks[pk.id] = lvl + 1; buzz(20); beep(600, 0.12); toast(pk.name + (pk.max > 1 ? ' level ' + (lvl + 1) : ' unlocked')); checkAch(); save(); updateUnits(); buildCommand(); };
      right.appendChild(btn); card.appendChild(right); box.appendChild(card);
    });
  }
  function paneRecords(box) {
    const stat = (a, b) => '<div class="stat"><span>' + a + '</span><b>' + b + '</b></div>';
    const totalTroops = S.units.reduce((x, y) => x + y, 0);
    box.appendChild(el('h3', '', 'Service record'));
    const st = el('div', 'panel');
    st.innerHTML = stat('Supplies per second', fmt(C.sps(S))) + stat('Per drill', fmt(C.tapValue(S))) + stat('Total earned', fmt(S.life)) + stat('This tour earned', fmt(S.run)) + stat('Time on this tour', fmtDur(S.runSecs)) +
      stat('Time served (total)', fmtDur(S.playSecs)) + stat('Troops this tour', totalTroops.toLocaleString()) + stat('Drills', S.taps.toLocaleString()) + stat('Promotions', S.promos) + stat('Missions done', S.missionsDone) + stat('Crates caught', S.crates) + stat('Field orders accepted', S.events) + stat('Unit milestones', S.milestones) + stat('Days visited', S.daily.served);
    box.appendChild(st);
    box.appendChild(el('h3', '', 'Personal bests'));
    const pb = el('div', 'panel');
    pb.innerHTML = stat('Highest supplies / sec', fmt(Math.max(S.bestSps, C.sps(S)))) + stat('Biggest single drill', fmt(Math.max(S.bestTap, C.tapValue(S)))) + stat('Best tour earnings', fmt(Math.max(S.bestRun, S.run))) + stat('Fastest promotion', S.fastestPromo ? fmtDur(S.fastestPromo) : 'not yet');
    box.appendChild(pb);
    box.appendChild(el('h3', '', 'Troops'));
    const tr = el('div', 'panel');
    tr.innerHTML = C.UNITS.map((u, i) => stat(u.emoji + ' ' + u.plural, S.units[i].toLocaleString() + ' · ' + fmt(S.units[i] * u.rate * C.unitMult(S, i) * C.globalMult(S)) + '/s')).join('');
    box.appendChild(tr);

    box.appendChild(el('h3', '', 'Collection (' + C.achCount(S) + '/' + C.ACHIEVEMENTS.length + ', +' + Math.round(C.achCount(S) * C.ACH_BONUS * 100) + '% to everything)'));
    const grid = el('div', 'badges');
    C.ACHIEVEMENTS.forEach((a) => {
      const done = !!S.ach[a.id];
      const t = el('button', 'badge ' + (done ? 'done' : 'locked'), '<i>' + a.emoji + '</i><b>' + (done ? a.name : '???') + '</b>');
      t.onclick = () => toast((done ? '★ ' + a.name + ': ' : 'Locked: ') + a.desc);
      grid.appendChild(t);
    });
    box.appendChild(grid);
  }
  function paneSettings(box) {
    box.appendChild(el('h3', '', 'Look and layout'));
    const look = el('div', 'panel');
    look.appendChild(el('div', 'lbl', 'Color theme'));
    look.appendChild(chips(Object.keys(THEME_NAMES).map((k) => [k, THEME_NAMES[k]]), S.set.theme, (v) => { S.set.theme = v; applyLook(); save(); buildCommand(); }));
    look.appendChild(sw('Compact layout (smaller cards, more on screen)', 'compact', applyLook));
    box.appendChild(look);

    box.appendChild(el('h3', '', 'Cloud save'));
    const cl = el('div', 'panel'); const cb = el('button', 'btn', 'Cloud save'); cb.onclick = () => { if (window.Cloud) Cloud.open(); }; cl.appendChild(cb); box.appendChild(cl);

    box.appendChild(el('h3', '', 'Sound and feel'));
    const set = el('div', 'panel');
    set.appendChild(sw('Vibration', 'haptics'));
    set.appendChild(el('div', 'lbl', 'Vibration strength'));
    set.appendChild(chips([[1, 'Light'], [2, 'Normal'], [3, 'Strong']], S.set.hlevel, (v) => { S.set.hlevel = v; save(); buzz(25); buildCommand(); }));
    set.appendChild(sw('Sound effects', 'sound'));
    set.appendChild(el('div', 'lbl', 'Sound pack (tap to hear)'));
    set.appendChild(chips([['arcade', 'Arcade'], ['soft', 'Soft'], ['radio', 'Radio'], ['tactical', 'Tactical']], S.set.pack, (v) => { S.set.pack = v; const was = S.set.sound; S.set.sound = true; beep(520, 0.1); setTimeout(() => beep(700, 0.1), 110); S.set.sound = was; save(); buildCommand(); }));
    const vr = el('div', 'setrow', '<span>Volume</span>');
    const vol = el('input'); vol.type = 'range'; vol.min = 0.1; vol.max = 1; vol.step = 0.05; vol.value = S.set.vol; vol.className = 'slider';
    vol.onchange = () => { S.set.vol = +vol.value; save(); const was = S.set.sound; S.set.sound = true; beep(600, 0.1); S.set.sound = was; };
    vr.appendChild(vol); set.appendChild(vr);
    box.appendChild(set);

    if (C.perkLvl(S, 'auto') || C.perkLvl(S, 'cour')) {
      box.appendChild(el('h3', '', 'Automation'));
      const au = el('div', 'panel');
      if (C.perkLvl(S, 'auto')) au.appendChild(sw('Auto-Recruiter', 'autoBuy'));
      if (C.perkLvl(S, 'cour')) au.appendChild(sw('Field Courier (repeat finished missions)', 'autoMission'));
      box.appendChild(au);
    }

    box.appendChild(el('h3', '', 'Save'));
    const sv = el('div', 'panel');
    const r1 = el('div', 'setrow', '<span>Save to clipboard</span>');
    const exp = el('button', 'btn ghost', 'Export'); exp.onclick = () => {
      save(); const code = btoa(unescape(encodeURIComponent(JSON.stringify(S))));
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => toast('Save copied. Paste it on your other device.'), () => toast('Clipboard blocked'));
    };
    r1.appendChild(exp); sv.appendChild(r1);
    const r2 = el('div', 'setrow', '<span>Load a saved code</span>');
    const imp = el('button', 'btn ghost', 'Import'); imp.onclick = () => {
      const code = prompt('Paste your save code:'); if (!code) return;
      try { const d = JSON.parse(decodeURIComponent(escape(atob(code.trim())))); if (!Array.isArray(d.units)) throw 0; localStorage.setItem(SAVE_KEY, JSON.stringify(d)); location.reload(); } catch (e) { toast('That code did not work'); }
    };
    r2.appendChild(imp); sv.appendChild(r2);
    const r3 = el('div', 'setrow', '<span>Erase everything</span>');
    const rst = el('button', 'btn danger', 'Reset'); rst.onclick = () => showModal('<h2>Erase all progress?</h2>This cannot be undone.', [['Cancel', null, 'ghost'], ['Erase', () => { try { localStorage.removeItem(SAVE_KEY); indexedDB.deleteDatabase('coc-backup'); } catch (e) { /* ignore */ } location.reload(); }, 'danger']]);
    r3.appendChild(rst); sv.appendChild(r3);
    box.appendChild(sv);
  }
  function promoPct() { const a = C.lifeForMedal(S.medals), b = C.lifeForMedal(S.medals + 1); return Math.max(0, Math.min(100, (S.life - a) / (b - a) * 100)); }
  function panePromo(box) {
    const nr = C.nextRank(S.medals);
    const gainM = C.promotionGain(S);
    box.appendChild(el('h3', '', 'Promotion'));
    const p = el('div', 'panel');
    p.innerHTML = '<div class="promo-big"><b>' + callsign() + '</b> · ' + S.medals + ' medals · +' + Math.round(S.medals * C.MEDAL_BONUS * 100) + '% to everything<br>' +
      (nr ? '<span class="dim">Next rank: ' + nr.title + ' at ' + nr.medals + ' medals</span>' : '<span class="dim">Highest rank reached. Legend.</span>') + '<br><br>' +
      (gainM >= 1 ? 'Ready to be promoted for <b style="color:var(--accent)">+' + gainM + ' medal' + (gainM > 1 ? 's' : '') + ' and ' + gainM + ' Honor' + (gainM > 1 ? 's' : '') + '</b>.' : 'Next medal at <b>' + fmt(C.lifeForMedal(S.medals + 1)) + '</b> supplies earned in total. Each medal costs more than the last.') +
      '<div class="bar fat"><i style="width:' + promoPct() + '%"></i></div><div class="dim" style="font-size:12.5px;margin-top:4px">' + fmt(S.life) + ' / ' + fmt(C.lifeForMedal(S.medals + 1)) + ' earned in total</div>' +
      '<br><span class="dim" style="font-size:13px">Promotion resets your supplies, troops and gear. You keep your medals, Honors, perks, collection and rank.</span></div>';
    const pb = el('button', 'btn', 'Get promoted'); pb.disabled = gainM < 1;
    pb.onclick = () => showModal('<h2>Request promotion?</h2>You will gain <b>' + gainM + '</b> medal' + (gainM > 1 ? 's' : '') + ' and ' + gainM + ' Honor' + (gainM > 1 ? 's' : '') + ', and start a new tour from the bottom.', [['Not yet', null, 'ghost'], ['Promote me', doPromote]]);
    p.appendChild(pb); box.appendChild(p);
    box.appendChild(el('h3', '', 'Dispatch log'));
    const log = el('div', 'panel log');
    log.innerHTML = S.log.length ? S.log.slice().reverse().map((t) => '<div>' + t + '</div>').join('') : '<div>Nothing yet.</div>';
    box.appendChild(log);
  }
  function doPromote() {
    const g = C.promotionGain(S); if (g < 1) return;
    const before = rank();
    S.bestRun = Math.max(S.bestRun, S.run);
    if (!S.fastestPromo || S.runSecs < S.fastestPromo) S.fastestPromo = S.runSecs;
    S.medals += g; S.honors += g; S.promos++; S.runSecs = 0;
    S.sp = 0; S.run = 0; S.units = C.UNITS.map(() => 0); S.ups = {}; S.mission = null; S.buff = null;
    S.units[0] = 10 * C.perkLvl(S, 'vet');
    const after = rank();
    addLog(after !== before ? 'Promoted to ' + after.title + '. The paperwork alone took three weeks.' : 'Another tour complete. Medals polished.');
    buzz([30, 40, 30]); beep(800, 0.2);
    toast(after !== before ? 'Promoted to ' + after.title + '!' : '+' + g + ' medals');
    checkAch(); save(); buildUnits(); buildUps(true); buildMissions(); buildCommand(); updateUnits(); updateBuff();
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
    if (C.perkLvl(S, 'net')) { const r = Math.max(40, C.sps(S) * 90 + C.tapValue(S) * 20) * 0.6; gain(r); S.crates++; toast('📦 Crate net caught +' + fmt(r)); checkAch(); return; }
    const c = el('button', 'crate', '📦');
    c.style.left = (8 + Math.random() * 72) + 'vw'; c.style.top = (22 + Math.random() * 50) + 'vh';
    c.onpointerdown = (e) => {
      e.preventDefault();
      const r = Math.max(40, C.sps(S) * 90 + C.tapValue(S) * 20);
      gain(r); S.crates++; buzz(25); beep(760, 0.15); toast('Supply drop! +' + fmt(r)); c.remove(); checkAch();
    };
    document.body.appendChild(c); setTimeout(() => c.remove(), 12000);
  }

  /* ---------------- field orders (timed boosts) ---------------- */
  let offer = null;
  const eventDelay = () => (150 + Math.random() * 120) * 1000 * (1 - 0.15 * C.perkLvl(S, 'sig'));
  let nextEventAt = Date.now() + 90000;
  function showOffer() {
    const e = C.EVENTS[Math.floor(Math.random() * C.EVENTS.length)];
    offer = { e, expires: Date.now() + 30000 };
    const b = $('event'); b.hidden = false; b.dataset.id = e.id;
    buzz([10, 30, 10]); beep(700, 0.08); setTimeout(() => beep(900, 0.1), 100);
  }
  function renderOffer() {
    if (!offer) return;
    const left = Math.max(0, Math.ceil((offer.expires - Date.now()) / 1000));
    const extra = offer.e.secs ? ' for ' + (offer.e.secs + 15 * C.perkLvl(S, 'sig')) + 's' : '';
    $('event').innerHTML = '<span>' + offer.e.emoji + '</span><div><b>' + offer.e.name + '</b><small>' + offer.e.text + extra + '. Tap to accept (' + left + 's)</small></div>';
  }
  $('event').onclick = () => {
    if (!offer) return;
    const e = offer.e;
    if (e.instant) { const r = Math.max(60, C.sps(S) * e.instant); gain(r); toast('🗂️ Intel Windfall: +' + fmt(r)); }
    else { S.buff = { id: e.id, name: e.name, emoji: e.emoji, prod: e.prod, tap: e.tap, end: Date.now() + (e.secs + 15 * C.perkLvl(S, 'sig')) * 1000 }; toast(e.emoji + ' ' + e.name + ': ' + e.text); }
    S.events++; buzz([15, 30, 15]); beep(800, 0.12);
    offer = null; $('event').hidden = true; nextEventAt = Date.now() + eventDelay(); checkAch();
  };
  function updateBuff() {
    const b = $('buff');
    if (S.buff && S.buff.end > Date.now()) { b.hidden = false; b.textContent = S.buff.emoji + ' ' + S.buff.name + ' · ' + Math.ceil((S.buff.end - Date.now()) / 1000) + 's'; }
    else { b.hidden = true; if (S.buff) S.buff = null; }
  }
  function eventTick(now) {
    if (offer) {
      if (now > offer.expires) { offer = null; $('event').hidden = true; nextEventAt = now + eventDelay() * 0.5; } else renderOffer();
    } else if (now >= nextEventAt && !document.hidden && $('modal').hidden && !(S.buff && S.buff.end > now)) { showOffer(); renderOffer(); }
    updateBuff();
  }

  /* ---------------- daily visit bonus ---------------- */
  function todayStr() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function checkDaily() {
    const t = todayStr(); if (S.daily.last === t) return;
    S.daily.last = t; S.daily.served++;
    const day = (S.daily.served - 1) % 7;
    const r = Math.max(100 * (day + 1), C.sps(S) * C.DAILY_SECS[day]);
    gain(r); checkAch(); save();
    const pips = '<div class="dailypips">' + C.DAILY_SECS.map((_, k) => '<i class="' + (k <= day ? 'on' : '') + '">' + (k + 1) + '</i>').join('') + '</div>';
    showModal('<h2>Daily bonus</h2>Day ' + (day + 1) + ' of 7 in this cycle' + pips + '<div class="big">+' + fmt(r) + '</div><span class="dim" style="font-size:13px">Visits just add up. Skipping a day never costs you anything.</span>', [['Thanks', null]]);
  }

  /* ---------------- main loop ---------------- */
  function awayText(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h ? h + ' hr' + (m ? ' ' + m + ' min' : '') : m + ' min';
  }
  function awayModal(secs, earned, capH) {
    const m = S.mission && S.mission.end <= Date.now() ? '<br>Your mission team is back and waiting in Ops.' : '';
    const capped = secs > capH * 3600 ? '<br><span class="dim" style="font-size:13px">Troops only stand watch for ' + capH + ' hours. The Long Watch perk in the Honors shop makes that longer.</span>' : '';
    showModal('<h2>Welcome back, ' + callsign() + '</h2>Gone for ' + awayText(secs) + '. Your troops kept working at ' + Math.round(C.offlineEff(S) * 100) + '% pace and earned<div class="big">+' + fmt(earned) + '</div>' + m + capped, [['At ease', null]]);
  }
  let lastRender = 0;
  function tick() {
    const now = Date.now();
    let dt = (now - S.last) / 1000;
    S.last = now;
    if (dt > 3) {
      const capH = C.offlineCapHours(S), secs = Math.min(dt, capH * 3600);
      const b = S.buff; S.buff = null; // boosts do not count while you are away
      const earned = C.sps(S) * secs * C.offlineEff(S);
      S.buff = b; gain(earned);
      if (dt > 60 && earned > 0) awayModal(dt, earned, capH);
    } else if (dt > 0) { gain(C.sps(S) * dt); S.playSecs += dt; S.runSecs += dt; }
    updateHeader(); updateUnits(); updateUpAfford(); updateMissions(); eventTick(now);
    if (now - lastAuto > 1000) {
      lastAuto = now; autoBuy();
      if (C.perkLvl(S, 'cour') && S.set.autoMission && S.mission && S.mission.end <= now) claimMission(true);
    }
    if (now - lastRender > 1000) {
      lastRender = now;
      S.bestSps = Math.max(S.bestSps, C.sps(S)); S.bestTap = Math.max(S.bestTap, C.tapValue(S));
      checkDispatch(); checkAch(); buildUps(false);
      if (tab === 'command' && paneStatic()) { const sc = $('tab-command').scrollTop; buildCommand(); $('tab-command').scrollTop = sc; }
      if (tab === 'ops') { /* keep reward text fresh without wiping the buttons */ }
    }
  }
  function updateHeader() {
    $('rank').textContent = callsign() + ' · ' + S.medals + ' ★';
    const rb = $('rankbar'); if (rb) rb.style.width = promoPct().toFixed(1) + '%';
    $('sp').textContent = fmt(S.sp);
    $('sps').textContent = fmt(C.sps(S), C.sps(S) < 10 ? 1 : 0) + ' supplies / sec';
    $('tapval').textContent = '+' + fmt(C.tapValue(S)) + ' per drill';
    $('quick').textContent = S.mission ? (S.mission.end <= Date.now() ? 'A mission is ready to collect in Ops.' : 'Mission underway: ' + C.fmtTime((S.mission.end - Date.now()) / 1000)) : 'Tip: crates drop in now and then. Tap them fast.';
  }

  /* ---------------- start ---------------- */
  applyLook(); buildModes(); buildUnits(); buildUps(true); buildMissions();
  if (!S.log.length) { S.log.push(C.DISPATCHES[0].t); S.seen = 1; }
  $('dispatch').textContent = S.log[S.log.length - 1];
  tick(); checkDaily();
  setInterval(tick, 100);
  setInterval(save, 5000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else { tick(); checkDaily(); } });
  window.addEventListener('pagehide', save);
  scheduleCrate();
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) { const had = !!navigator.serviceWorker.controller; navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) location.reload(); }); navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => { const chk = () => { try { reg.update(); } catch (e) { /* ignore */ } }; document.addEventListener('visibilitychange', () => { if (!document.hidden) chk(); }); setInterval(chk, 300000); }).catch(() => { /* offline support is optional */ }); }
})();
