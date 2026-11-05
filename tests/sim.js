// Rough pacing check: a player who ignores taps and always buys the best-value unit/upgrade.
const C = require('../core.js');
const s = C.freshState();
let t = 0;
const marks = [1e3, 1e4, 1e5, 1e6, C.PROMO_DIV, 1e8, 1e9];
let mi = 0;
function best() {
  const cur = C.sps(s);
  let pick = null;
  C.UNITS.forEach((u, i) => {
    const cost = C.unitCost(i, s.units[i], 1);
    s.units[i]++; const d = C.sps(s) - cur; s.units[i]--;
    const score = cost / Math.max(d, 1e-9);
    if (!pick || score < pick.score) pick = { kind: 'u', i, cost, score };
  });
  C.UPGRADES.forEach((u) => {
    if (s.ups[u.id]) return;
    if (u.req.unit !== undefined && s.units[u.req.unit] < u.req.owned) return;
    if (u.req.earned !== undefined && s.run < u.req.earned) return;
    s.ups[u.id] = true; const d = C.sps(s) - cur; delete s.ups[u.id];
    if (d <= 0) return;
    const score = u.cost / d;
    if (!pick || score < pick.score) pick = { kind: 'up', u, cost: u.cost, score };
  });
  return pick;
}
s.sp = 15; // a few starter taps
while (t < 3600 * 6 && mi < marks.length) {
  const p = best();
  const rate = Math.max(C.sps(s), 1 / 3); // ~1 tap per 3 sec of idle-ish play at the very start
  const wait = Math.max(0, (p.cost - s.sp) / rate);
  s.sp += rate * wait; s.run += rate * wait; s.life += rate * wait; t += wait;
  s.sp -= p.cost;
  if (p.kind === 'u') s.units[p.i]++; else s.ups[p.u.id] = true;
  while (mi < marks.length && s.run >= marks[mi]) { console.log(`${C.fmt(marks[mi]).padStart(6)} earned after ${(t / 60).toFixed(1)} min  (income ${C.fmt(C.sps(s))}/s)`); mi++; }
}
