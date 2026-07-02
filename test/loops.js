// Prestige-loop pacing analysis — does the meta (tree + talents) actually accelerate loops?
// Runs repeated Restructure loops WITH meta-reinvestment vs a no-reinvest control.
// Run with: node test/loops.js
const { loadEngine } = require("./harness");
const E = loadEngine();

const clock = (s) => s < 60 ? s + "s" : s < 3600 ? (s / 60).toFixed(1) + "m" : (s / 3600).toFixed(2) + "h";
const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : Math.round(n).toString();

// ---- in-run greedy strategy (same spirit as balance.js) ----
const RESERVE = 40;
function sellAll(id) { const a = E.state.items[id] || 0; if (a > 0) { E.addCredits(a * E.ITEMS[id].sell * E.marketMult()); E.state.items[id] = 0; } }
function sellSurplus() {
  const consumed = new Set();
  for (const k of E.MORDER) if ((E.state.machines[k] || 0) > 0) for (const r in E.MACHINES[k].in) consumed.add(r);
  for (const id in E.ITEMS) { if (!E.itemUnlocked(id) || consumed.has(id)) continue; const q = (E.state.items[id] || 0) - RESERVE; if (q > 0) { E.addCredits(q * E.ITEMS[id].sell * E.marketMult()); E.state.items[id] = RESERVE; } }
}
function strategize() {
  const s = E.state;
  if ((s.machines.ironFurnace || 0) > 0) sellSurplus(); else sellAll("ironOre");
  for (const k of E.MORDER) { if (!s.unlocked[k] || (s.machines[k] || 0) > 0) continue; const p = E.planMachine(k, 1), bom = E.scaleBOM(E.buildBOM(k), p.n); if (p.n > 0 && E.canAfford(p.cost, bom)) { E.pay(p.cost, bom); s.machines[k] += p.n; s.stats.built += p.n; E.refreshUnlocks(true); } }
  if (E.lastPower.ratio < 1) { for (let i = 0; i < 40; i++) { let best = null, score = -1;
    for (const g of E.GORDER) { if (!E.genUnlocked(g)) continue; const p = E.planGenerator(g, 1); if (p.n <= 0) continue; const bom = E.scaleBOM(E.GENERATORS[g].build.bom, p.n); if (!E.canAfford(p.cost, bom)) continue; const sc = E.GENERATORS[g].power * (E.GENERATORS[g].fuel ? 1 : 10); if (sc > score) { score = sc; best = { g, p, bom }; } }
    if (!best) break; E.pay(best.p.cost, best.bom); s.generators[best.g] += best.p.n; } }
  for (const id in E.ITEMS) { if (E.itemUnlocked(id) && (s.items[id] || 0) >= E.capOf(id) - 1e-6) { const p = E.planWarehouse(1); if (p.n > 0 && E.canAfford(p.cost, E.scaleBOM(E.WAREHOUSE.bom, p.n))) { E.pay(p.cost, E.scaleBOM(E.WAREHOUSE.bom, p.n)); s.warehouses += p.n; } break; } }
  for (let i = 0; i < 12; i++) { let best = null, bc = Infinity; for (const k of E.MORDER) { if (!s.unlocked[k]) continue; const p = E.planMachine(k, 1); if (p.n > 0 && p.cost < bc && E.canAfford(p.cost, E.scaleBOM(E.buildBOM(k), 1))) { bc = p.cost; best = k; } } if (!best) break; const p = E.planMachine(best, 1); E.pay(p.cost, E.scaleBOM(E.buildBOM(best), p.n)); s.machines[best] += p.n; s.stats.built += p.n; E.refreshUnlocks(true); }
}

// ---- pure meta reinvestment (no DOM) ----
function available(id) { if (id === "start" || E.state.allocated[id]) return false; for (const l of E.NODES[id].links) if (E.state.allocated[l]) return true; return false; }
function nodeScore(n) { const e = n.eff; return (e.prod || 0) * 3 + (e.sell || 0) * 2 + (e.bp || 0) * 2 + (e.cap || 0) + (e.power || 0) + (e.grid || 0) * 0.03 + (e.auto ? 1 : 0) + (e.offeff || 0) + (e.click || 0) * 0.01; }
function reinvestBP() {
  let guard = 0;
  while (guard++ < 800) {
    let best = null, bestPer = -1;
    for (const id in E.NODES) { if (!available(id)) continue; const n = E.NODES[id]; if (n.cost > E.state.blueprints) continue; const per = nodeScore(n) / Math.max(1, n.cost); if (per > bestPer) { bestPer = per; best = id; } }
    if (!best) break;
    E.state.blueprints -= E.NODES[best].cost; E.state.allocated[best] = true; E.state.stats.allocs++;
  }
  E.recomputeStats();
}
function reinvestTP() {
  let guard = 0;
  while (guard++ < 2000) {
    let best = null, bc = Infinity;
    for (const t of E.TALENTS) { if (!E.tierUnlocked(t.tier)) continue; const r = E.state.talents[t.id] || 0; if (r >= t.max) continue; const c = E.talentCost(t, r); if (c <= E.state.talentPoints && c < bc) { bc = c; best = t; } }
    if (!best) break;
    const r = E.state.talents[best.id] || 0; E.state.talentPoints -= E.talentCost(best, r); E.state.talents[best.id] = r + 1;
  }
  E.recomputeStats();
}

function runOneLoop(target, maxSec) {
  let t = 0;
  for (t = 0; t < maxSec; t++) {
    E.state.items.ironOre = Math.min(E.capOf("ironOre"), (E.state.items.ironOre || 0) + E.orePerClick());
    E.state.stats.produced += E.orePerClick();
    strategize();
    E.simulate(1, 1); E.grantTP(); E.refreshUnlocks(true); E.checkMilestones(); E.checkAgeGoals();
    const a = E.currentAge(); if (a > (E.state.maxAge || 1)) { E.state.maxAge = a; E.recomputeStats(); } // permanent age dividend
    if (E.bpFor(E.state.runCredits) >= target) break;
  }
  return t;
}
function prestige() {
  const gain = E.bpFor(E.state.runCredits);
  E.state.blueprints += gain; E.state.stats.bpEarned += gain; E.state.bpCycle = (E.state.bpCycle || 0) + gain; E.state.prestiges++;
  E.freshRun(E.state); E.recomputeStats();
  return gain;
}

function runSession(reinvest, loops, maxSecPerLoop) {
  E.state = E.defaultState(); E.recomputeStats();
  const rows = []; let total = 0;
  for (let i = 1; i <= loops; i++) {
    const target = Math.max(1, Math.ceil(E.state.stats.bpEarned * 0.5));
    const t = runOneLoop(target, maxSecPerLoop);
    const stalled = E.bpFor(E.state.runCredits) < target;
    const gain = prestige();
    if (reinvest) { reinvestBP(); reinvestTP(); }
    total += t;
    rows.push({ i, t, target, gain, totalBP: E.state.stats.bpEarned, prod: +E.globalRate().toFixed(2), rawEff: +E.rawEff().toFixed(2), tp: E.state.talentPoints, allocs: E.state.stats.allocs, patents: E.patentsUnlocked(), stalled });
  }
  return { rows, total };
}

function printSession(title, s) {
  console.log(`\n=== ${title} ===`);
  console.log("loop | time  | targetBP | gained | totalBP | prod× | rawEff | TP  | nodes | patents");
  for (const r of s.rows) {
    console.log(
      String(r.i).padStart(4) + " | " + clock(r.t).padStart(5) + " | " + String(r.target).padStart(8) + " | " +
      String(r.gain).padStart(6) + " | " + String(r.totalBP).padStart(7) + " | " + String(r.prod).padStart(5) + " | " +
      String(r.rawEff).padStart(6) + " | " + String(r.tp).padStart(3) + " | " + String(r.allocs).padStart(5) + " | " +
      (r.patents ? "yes" : "no") + (r.stalled ? "  ⚠STALLED" : ""));
  }
  console.log(`total time over ${s.rows.length} loops: ${clock(s.total)}`);
}

const LOOPS = 8, CAP = 6 * 3600;
const withMeta = runSession(true, LOOPS, CAP);
const control = runSession(false, LOOPS, CAP);
printSession("WITH meta reinvestment (spend BP in tree + TP in talents)", withMeta);
printSession("CONTROL (prestige, but never spend BP/TP)", control);
console.log(`\nSpeed-up: ${LOOPS} loops took ${clock(withMeta.total)} with reinvestment vs ${clock(control.total)} without` +
  ` (${(control.total / Math.max(1, withMeta.total)).toFixed(2)}× faster).`);
