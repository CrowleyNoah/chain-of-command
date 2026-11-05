/* core.js - the numbers behind Chain of Command (no screen code in here, so it can be tested). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GameCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GROWTH = 1.15;               // each unit you buy costs 15% more than the last
  const PROMO_DIV = 2e6;             // first promotion at 2 million supplies earned in a run
  const MEDAL_BONUS = 0.10;          // each medal = +10% to everything
  const ACH_BONUS = 0.02;            // each achievement = +2% to everything
  const OFFLINE_EFFICIENCY = 0.5;    // troops produce half while you're away
  const OFFLINE_CAP_HOURS = 8;
  const MILESTONES = [25, 50, 100, 150, 200, 250, 300, 400, 500]; // owning this many doubles that unit

  const UNITS = [
    { id: 'recruit',  name: 'Recruit',          plural: 'Recruits',          emoji: '🪖', base: 15,     rate: 0.1,    desc: 'Fresh off the bus. Mostly polishes boots.' },
    { id: 'rifle',    name: 'Rifleman',         plural: 'Riflemen',          emoji: '🎖️', base: 100,    rate: 1,      desc: 'Knows which end the bang comes out of.' },
    { id: 'medic',    name: 'Medic',            plural: 'Medics',            emoji: '⛑️', base: 1100,   rate: 8,      desc: 'Fixes problems with tape, hope and tape.' },
    { id: 'sniper',   name: 'Sniper',           plural: 'Snipers',           emoji: '🎯', base: 12000,  rate: 47,     desc: 'Patient. Extremely patient. Weirdly patient.' },
    { id: 'engineer', name: 'Combat Engineer',  plural: 'Combat Engineers',  emoji: '🔧', base: 130000, rate: 260,    desc: 'Builds bridges. Also builds the stuff that blows them up.' },
    { id: 'humvee',   name: 'Humvee Squad',     plural: 'Humvee Squads',     emoji: '🚙', base: 1.4e6,  rate: 1400,   desc: 'Loud, fast and always low on fuel.' },
    { id: 'heli',     name: 'Helicopter',       plural: 'Helicopters',       emoji: '🚁', base: 2e7,    rate: 7800,   desc: 'Delivers supplies and a very dramatic soundtrack.' },
    { id: 'jet',      name: 'Fighter Jet',      plural: 'Fighter Jets',      emoji: '✈️', base: 3.3e8,  rate: 44000,  desc: 'Arrives before the sound does.' },
    { id: 'carrier',  name: 'Aircraft Carrier', plural: 'Aircraft Carriers', emoji: '🚢', base: 5.1e9,  rate: 260000, desc: 'A small city that floats and judges you.' },
    { id: 'orbital',  name: 'Orbital Command',  plural: 'Orbital Commands',  emoji: '🛰️', base: 7.5e10, rate: 1.6e6,  desc: 'Sees everything. Still can\'t find the TV remote.' }
  ];

  /* ---- upgrades ---- */
  const UPGRADES = [];
  UNITS.forEach((u, i) => {
    UPGRADES.push({ id: 'u' + i + 'a', name: u.name + ' Drills', desc: u.plural + ' work twice as fast.', cost: u.base * 60, req: { unit: i, owned: 10 }, effect: { type: 'unit', unit: i, mult: 2 }, emoji: u.emoji });
    UPGRADES.push({ id: 'u' + i + 'b', name: 'Elite ' + u.plural, desc: u.plural + ' work three times as fast.', cost: u.base * 4000, req: { unit: i, owned: 50 }, effect: { type: 'unit', unit: i, mult: 3 }, emoji: u.emoji });
  });
  UPGRADES.push(
    { id: 't1', name: 'Sturdy Boots',    desc: 'Drilling gives 2x supplies.',                       cost: 200,    req: { earned: 50 },   effect: { type: 'tap', mult: 2 },   emoji: '🥾' },
    { id: 't2', name: 'Drill Instructor', desc: 'Drilling gives 3x supplies.',                       cost: 3000,   req: { earned: 1000 }, effect: { type: 'tap', mult: 3 },   emoji: '📣' },
    { id: 't3', name: 'Battle Cry',       desc: 'Each drill also gives 5% of your supplies per second.', cost: 60000,  req: { earned: 2e4 },  effect: { type: 'tapPct', pct: 0.05 }, emoji: '🔥' },
    { id: 't4', name: 'Warpath',          desc: 'Each drill also gives 10% of your supplies per second.', cost: 5e6,    req: { earned: 2e6 },  effect: { type: 'tapPct', pct: 0.10 }, emoji: '⚔️' },
    { id: 'g1', name: 'Field Rations',      desc: 'Everything produces 25% more.', cost: 4000,    req: { earned: 1000 }, effect: { type: 'global', mult: 1.25 }, emoji: '🥫' },
    { id: 'g2', name: 'Logistics Network',  desc: 'Everything produces 50% more.', cost: 4e5,     req: { earned: 1e5 },  effect: { type: 'global', mult: 1.5 },  emoji: '🚚' },
    { id: 'g3', name: 'Air Supply Lines',   desc: 'Everything produces twice as much.', cost: 4e7,  req: { earned: 1e7 },  effect: { type: 'global', mult: 2 },    emoji: '🪂' },
    { id: 'g4', name: 'War Economy',        desc: 'Everything produces 3x as much.', cost: 4e9,    req: { earned: 1e9 },  effect: { type: 'global', mult: 3 },    emoji: '🏭' },
    { id: 'g5', name: 'Total Mobilization', desc: 'Everything produces 5x as much.', cost: 4e11,   req: { earned: 1e11 }, effect: { type: 'global', mult: 5 },    emoji: '🌐' }
  );

  /* ---- ranks (based on total medals) ---- */
  const RANKS = [
    { medals: 0,  title: 'Private',         abbr: 'Pvt.' },
    { medals: 1,  title: 'Private First Class', abbr: 'PFC' },
    { medals: 3,  title: 'Corporal',        abbr: 'Cpl.' },
    { medals: 6,  title: 'Sergeant',        abbr: 'Sgt.' },
    { medals: 10, title: 'Staff Sergeant',  abbr: 'SSgt.' },
    { medals: 15, title: 'Lieutenant',      abbr: 'Lt.' },
    { medals: 22, title: 'Captain',         abbr: 'Capt.' },
    { medals: 30, title: 'Major',           abbr: 'Maj.' },
    { medals: 40, title: 'Colonel',         abbr: 'Col.' },
    { medals: 55, title: 'General',         abbr: 'Gen.' },
    { medals: 80, title: 'Five-Star General', abbr: 'Gen. of the Army' }
  ];

  /* ---- timed missions ---- */
  const MISSIONS = [
    { id: 'recon',  name: 'Recon Patrol',     secs: 30,   rewardSecs: 120,  min: 25,   unlock: 0,   desc: 'Quick walk, quick snack, quick profit.' },
    { id: 'raid',   name: 'Supply Depot Raid', secs: 120,  rewardSecs: 700,  min: 150,  unlock: 5e3, desc: 'Borrow some supplies from people who weren\'t using them.' },
    { id: 'siege',  name: 'Fortress Siege',   secs: 600,  rewardSecs: 5000, min: 900,  unlock: 5e5, desc: 'Long, loud and very scenic.' },
    { id: 'campaign', name: 'Full Campaign',  secs: 1800, rewardSecs: 20000, min: 4000, unlock: 5e7, desc: 'Half an hour. Make some coffee.' }
  ];

  /* ---- achievements ---- */
  const ACHIEVEMENTS = [
    { id: 'tap1',   name: 'Reporting for Duty',  desc: 'Drill for the first time.',        test: (s) => s.taps >= 1 },
    { id: 'tap100', name: 'Trigger Finger',      desc: 'Drill 100 times.',                 test: (s) => s.taps >= 100 },
    { id: 'tap1k',  name: 'Blister Pack',        desc: 'Drill 1,000 times.',               test: (s) => s.taps >= 1000 },
    { id: 'rec10',  name: 'Squad Up',            desc: 'Own 10 Recruits.',                 test: (s) => s.units[0] >= 10 },
    { id: 'rec50',  name: 'Platoon',             desc: 'Own 50 Recruits.',                 test: (s) => s.units[0] >= 50 },
    { id: 'rif25',  name: 'Rifle Club',          desc: 'Own 25 Riflemen.',                 test: (s) => s.units[1] >= 25 },
    { id: 'arms',   name: 'Combined Arms',       desc: 'Own the first five unit types at once.', test: (s) => s.units.slice(0, 5).every((n) => n >= 1) },
    { id: 'm1',     name: 'Payday',              desc: 'Earn 1 million supplies in total.', test: (s) => s.life >= 1e6 },
    { id: 'm2',     name: 'Defense Budget',      desc: 'Earn 1 billion supplies in total.', test: (s) => s.life >= 1e9 },
    { id: 'm3',     name: 'Trillion Dollar Budget', desc: 'Earn 1 trillion supplies in total.', test: (s) => s.life >= 1e12 },
    { id: 'pro1',   name: 'Promoted!',           desc: 'Earn your first promotion.',       test: (s) => s.promos >= 1 },
    { id: 'pro5',   name: 'Career Soldier',      desc: 'Get promoted 5 times.',            test: (s) => s.promos >= 5 },
    { id: 'mis5',   name: 'Mission Control',     desc: 'Complete 5 missions.',             test: (s) => s.missionsDone >= 5 },
    { id: 'crate5', name: 'Supply Hawk',         desc: 'Catch 5 supply crates.',           test: (s) => s.crates >= 5 },
    { id: 'navy',   name: 'Naval Power',         desc: 'Own an Aircraft Carrier.',         test: (s) => s.units[8] >= 1 },
    { id: 'space',  name: 'Space Force',         desc: 'Own an Orbital Command.',          test: (s) => s.units[9] >= 1 }
  ];

  /* ---- story lines, shown as your total earnings grow ---- */
  const DISPATCHES = [
    { at: 0,     t: 'Day 1. You report to Fort Nobody. The sergeant hands you a broom and a motivational poster.' },
    { at: 100,   t: 'Your first recruit arrives. He brought his own pillow.' },
    { at: 1e3,   t: 'Word spreads: free meals at Fort Nobody. Enlistment is up 400%.' },
    { at: 1e4,   t: 'Command notices your numbers. Someone in an office finally learns your name.' },
    { at: 1e5,   t: 'The mess hall now serves something that is technically food.' },
    { at: 1e6,   t: 'A general visits. He nods once. You have never been prouder.' },
    { at: 1e7,   t: 'The base has its own weather now. Mostly dust.' },
    { at: 1e8,   t: 'Defense contractors send you a fruit basket and an invoice.' },
    { at: 1e9,   t: 'Your supply chain is longer than the Great Wall and twice as organized.' },
    { at: 1e10,  t: 'Neighboring countries start asking if you are "okay".' },
    { at: 1e12,  t: 'The Pentagon has a whole folder labeled "YOU".' },
    { at: 1e15,  t: 'Legend says the coffee at your base never runs out.' }
  ];

  /* ---- math ---- */
  const unitCost = (i, owned, n) => {
    n = n || 1;
    return UNITS[i].base * Math.pow(GROWTH, owned) * (Math.pow(GROWTH, n) - 1) / (GROWTH - 1);
  };
  function maxAffordable(i, owned, sp) {
    const first = UNITS[i].base * Math.pow(GROWTH, owned);
    if (sp < first) return 0;
    let n = Math.floor(Math.log((sp * (GROWTH - 1)) / first + 1) / Math.log(GROWTH));
    while (n > 0 && unitCost(i, owned, n) > sp) n--;
    return n;
  }
  const achCount = (s) => Object.keys(s.ach).length;
  function unitMult(s, i) {
    let m = 1;
    for (const t of MILESTONES) if (s.units[i] >= t) m *= 2;
    for (const u of UPGRADES) if (s.ups[u.id] && u.effect.type === 'unit' && u.effect.unit === i) m *= u.effect.mult;
    return m;
  }
  const medalMult = (s) => (1 + MEDAL_BONUS * s.medals) * (1 + ACH_BONUS * achCount(s));
  function globalMult(s) {
    let m = medalMult(s);
    for (const u of UPGRADES) if (s.ups[u.id] && u.effect.type === 'global') m *= u.effect.mult;
    return m;
  }
  function sps(s) {
    let t = 0;
    for (let i = 0; i < UNITS.length; i++) t += s.units[i] * UNITS[i].rate * unitMult(s, i);
    return t * globalMult(s);
  }
  function tapValue(s) {
    let mult = 1, pct = 0;
    for (const u of UPGRADES) {
      if (!s.ups[u.id]) continue;
      if (u.effect.type === 'tap') mult *= u.effect.mult;
      if (u.effect.type === 'tapPct') pct += u.effect.pct;
    }
    return mult * medalMult(s) + sps(s) * pct;
  }
  const promotionGain = (run) => Math.floor(Math.sqrt(run / PROMO_DIV));
  function rankFor(medals) {
    let r = RANKS[0];
    for (const x of RANKS) if (medals >= x.medals) r = x;
    return r;
  }
  function nextRank(medals) { return RANKS.find((x) => x.medals > medals) || null; }
  const missionReward = (m, s) => Math.max(m.min, sps(s) * m.rewardSecs);

  /* ---- number formatting ---- */
  const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  function fmt(n, dec) {
    if (!isFinite(n)) return '∞';
    if (n < 1000) {
      if (dec === undefined) dec = n < 10 && n % 1 !== 0 ? 1 : 0;
      return (Math.floor(n * Math.pow(10, dec)) / Math.pow(10, dec)).toString();
    }
    const k = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(n) / 3));
    const v = n / Math.pow(1000, k);
    return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + SUFFIX[k];
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m ? m + 'm ' + (s < 10 ? '0' : '') + s + 's' : s + 's';
  }

  function freshState() {
    return {
      sp: 0, run: 0, life: 0, units: UNITS.map(() => 0), ups: {}, medals: 0, promos: 0, taps: 0, crates: 0,
      missionsDone: 0, mission: null, ach: {}, log: [], seen: 0, buy: 1,
      set: { haptics: true, sound: false }, last: Date.now()
    };
  }

  return {
    UNITS, UPGRADES, RANKS, MISSIONS, ACHIEVEMENTS, DISPATCHES, MILESTONES,
    GROWTH, PROMO_DIV, MEDAL_BONUS, ACH_BONUS, OFFLINE_EFFICIENCY, OFFLINE_CAP_HOURS,
    unitCost, maxAffordable, unitMult, globalMult, sps, tapValue, promotionGain, rankFor, nextRank,
    missionReward, fmt, fmtTime, freshState, achCount
  };
});
