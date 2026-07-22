// Full-game PACING model — measures game-time to climb the ages across multiple Ascension ERAS.
// Unlike loops.js (which only models the within-era Restructure loop and never ascends), this models the
// whole macro-loop: climb ages via Restructures until Age VIII, then Ascend (deep reset, re-lock ages,
// gain Dark Matter, buy automations), and re-climb faster. Answers: "how long to reach & complete the top,
// and how many hours/eras does the endgame really take?"  Run with: node test/pace.js
const { loadEngine } = require("./harness");
const E = loadEngine();

const clock = (s) => s < 60 ? s.toFixed(0) + "s" : s < 3600 ? (s / 60).toFixed(1) + "m" : (s / 3600).toFixed(2) + "h";
const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : Math.round(n).toString();

// ---- in-run greedy strategy (mirrors loops.js) ----
const RESERVE = 40;
function sellSurplus() {
  const consumed = new Set();
  for (const k of E.MORDER) if ((E.state.machines[k] || 0) > 0) for (const r in E.MACHINES[k].in) consumed.add(r);
  for (const id in E.ITEMS) { if (!E.itemUnlocked(id) || consumed.has(id)) continue; const q = (E.state.items[id] || 0) - RESERVE; if (q > 0) { E.addCredits(E.sellValue(id, q)); E.state.items[id] = RESERVE; } }
}
function sellAll(id) { const a = E.state.items[id] || 0; if (a > 0) { E.addCredits(E.sellValue(id, a)); E.state.items[id] = 0; } }
function strategize() {
  const s = E.state;
  if ((s.machines.ironFurnace || 0) > 0) sellSurplus(); else sellAll("ironOre");
  for (const k of E.MORDER) { if (!s.unlocked[k] || (s.machines[k] || 0) > 0) continue; const p = E.planMachine(k, 1), bom = E.scaleBOM(E.buildBOM(k), p.n); if (p.n > 0 && E.canAfford(p.cost, bom)) { E.pay(p.cost, bom); s.machines[k] += p.n; s.stats.built += p.n; E.refreshUnlocks(true); } }
  fundPower();
  for (const id in E.ITEMS) { if (E.itemUnlocked(id) && (s.items[id] || 0) >= E.capOf(id) - 1e-6) { const p = E.planWarehouse(1); if (p.n > 0 && E.canAfford(p.cost, E.scaleBOM(E.WAREHOUSE.bom, p.n))) { E.pay(p.cost, E.scaleBOM(E.WAREHOUSE.bom, p.n)); s.warehouses += p.n; } break; } }
  // POWER-GATED EXPANSION: only add load when the grid can actually carry it. The old loop bought 150
  // machines/tick regardless, so the AI dug itself into a 39%-power hole and then "proved" the late game
  // was unreachable — a sim artefact, not a balance fact. A real player powers what they build.
  // When the grid is healthy, expand freely. When it's brown, DON'T stop building outright — a run seeded
  // by the Ascendant Foundation starts with a big machine pyramid and no generators, and refusing to build
  // would also refuse the low-tier machines that make the steel/circuits generators need. So while brown,
  // build only cheap low-tier feeders (which barely draw) until power catches up.
  E.computePower(0.001);
  const brown = E.lastPower.ratio <= 0.98;
  const cap = brown ? 25 : 150;
  for (let i = 0; i < cap; i++) { let best = null, bestFill = Infinity;
    for (const k of E.MORDER) { if (!s.unlocked[k]) continue;
      if (brown && E.MACHINES[k].t > 3) continue;                  // brown-out: feeders only
      const p = E.planMachine(k, 1); if (p.n <= 0) continue; const bom = E.scaleBOM(E.buildBOM(k), 1); if (!E.canAfford(p.cost, bom)) continue;
      const out = Object.keys(E.MACHINES[k].out)[0]; const fill = (E.state.items[out] || 0) / E.capOf(out); if (fill < bestFill) { bestFill = fill; best = k; } }
    if (!best) break; const p = E.planMachine(best, 1); E.pay(p.cost, E.scaleBOM(E.buildBOM(best), 1)); s.machines[best] += p.n; s.stats.built += p.n; E.refreshUnlocks(true);
    if (!brown && i % 10 === 9) { E.computePower(0.001); if (E.lastPower.ratio < 0.98) break; }   // re-check as load grows
  }
  fundPower();   // power the machines we just scaled (a real player wouldn't leave the grid at 5%)
}
// Build generators until the grid is satisfied (or credits run out) — spends only a slice of credits so it doesn't
// starve chain progress, but keeps power near 1 instead of letting it spiral (the old 40/tick cap did).
function fundPower() {
  const s = E.state;
  for (let i = 0; i < 250; i++) {
    E.computePower(0.001);
    if (E.lastPower.ratio >= 0.995) break;
    let best = null, score = -1;
    for (const g of E.GORDER) { if (!E.genUnlocked(g)) continue; const p = E.planGenerator(g, 1); if (p.n <= 0) continue;
      const bom = E.scaleBOM(E.GENERATORS[g].build.bom, p.n); if (!E.canAfford(p.cost, bom)) continue;
      const sc = E.GENERATORS[g].power * (E.GENERATORS[g].fuel ? 1 : 10); if (sc > score) { score = sc; best = { g, p, bom }; } }
    if (!best) break; E.pay(best.p.cost, best.bom); s.generators[best.g] += best.p.n;
  }
}
function available(id) { if (id === "start" || E.state.allocated[id]) return false; for (const l of E.NODES[id].links) if (E.state.allocated[l]) return true; return false; }
function nodeScore(n) { const ph = E.lastPower.ratio < 0.9 ? 8 : 2;   // chase power/grid when the grid is stressed
  const e = n.eff; return (e.prod || 0) * 3 + (e.sell || 0) * 2 + (e.bp || 0) * 2 + (e.cap || 0) + (e.power || 0) * ph + (e.grid || 0) * 0.04 + (e.gridPerAge||0)*(ph*0.2) + (e.prodPerAge||0)*20 + (e.prodPerMachine||0)*20 + (e.whProd||0)*30 + (e.smelt||0) + (e.auto ? 1 : 0); }
function reinvestBP() { let guard = 0;
  while (guard++ < 1500) { let best = null, bestPer = -1;
    for (const id in E.NODES) { if (!available(id)) continue; const n = E.NODES[id]; if (n.cost > E.state.blueprints) continue; const per = nodeScore(n) / Math.max(1, n.cost); if (per > bestPer) { bestPer = per; best = id; } }
    if (!best) break; E.state.blueprints -= E.NODES[best].cost; E.state.allocated[best] = true; E.state.stats.allocs++; }
  E.recomputeStats();
}
function reinvestTP() { let guard = 0;
  while (guard++ < 4000) { let best = null, bc = Infinity;
    for (const t of E.TALENTS) { if (!E.tierUnlocked(t.tier)) continue; const r = E.state.talents[t.id] || 0; if (r >= t.max) continue; const c = E.talentCost(t, r); if (c <= E.state.talentPoints && c < bc) { bc = c; best = t; } }
    if (!best) break; const r = E.state.talents[best.id] || 0; E.state.talentPoints -= E.talentCost(best, r); E.state.talents[best.id] = r + 1; }
  E.recomputeStats();
}
function tick() {
  E.state.overclock = true;                       // Age-II signature: +50% speed for +50% input (worth it when inputs flow)
  E.state.items.ironOre = Math.min(E.capOf("ironOre"), (E.state.items.ironOre || 0) + E.orePerClick());
  E.state.stats.produced += E.orePerClick();
  strategize();
  E.simulate(1, 1); E.grantTP(); E.refreshUnlocks(true); E.checkMilestones(); E.checkAgeGoals();
  // Von Neumann Fleet (Age-VI signature, PERMANENT across Restructure): launch every probe → permanent prod engine.
  const probes = Math.floor(E.state.items.probe || 0);
  if (probes >= 1) { E.state.items.probe -= probes; E.state.launched = (E.state.launched || 0) + probes; E.state.fleet = (E.state.fleet || 0) + probes; }
  // Dyson Swarm (Age-VII): deploy panels ONLY when power is short — otherwise keep them to feed the Age-VIII
  // Quantum Fab (dysonPanel is its input). A player balances this; deploying 100% would starve the tier-8 chain.
  if (E.lastPower.ratio < 0.999) { const panels = Math.floor(E.state.items.dysonPanel || 0);
    if (panels >= 1) { E.state.items.dysonPanel -= panels; E.state.dysonSwarm = (E.state.dysonSwarm || 0) + panels; } }
  const a = E.currentAge(); if (a > (E.state.maxAge || 1)) { E.state.maxAge = a; E.recomputeStats(); }
}
function restructure() {
  const gain = E.bpFor(E.state.runCredits); if (gain < 1) return 0;
  E.state.blueprints += gain; E.state.stats.bpEarned += gain; E.state.bpCycle = (E.state.bpCycle || 0) + gain; E.state.prestiges++; E.state.lastBpGain = gain;
  E.freshRun(E.state); E.recomputeStats(); reinvestBP(); reinvestTP();
  return gain;
}
// ---- PATENTS: the v0.46.0 preservation layer. The sim ignored this entirely, which understated
// progression badly — it's the layer that decides how fast each post-reset rebuild goes.
// Buy order = what actually shortens the next climb most: the tree back first, then the tech chain.
function buyPatents() {
  const pref = ["priorArt", "standing", "grandfather", "chartered", "vault", "franchise"];
  let bought = true;
  while (bought) { bought = false;
    for (const id of pref) { const p = E.PATENTS.find((x) => x.id === id); if (!p) continue;
      const l = E.state.patentUpg[id] || 0, c = E.patentCost(p, l);
      if ((E.state.patents || 0) >= c) { E.state.patents -= c; E.state.patentUpg[id] = l + 1; bought = true; break; } } }
}
// File only when the cycle banked a haul worth torching the tree for (filing wipes BP + tree), and
// never late in an era — a player about to Ascend/push does NOT throw their built tree away first.
function maybePatent(eraFrac) {
  const gain = E.patentAvailable();
  if (gain < 3) return 0;
  if (eraFrac > 0.6) return 0;
  E.state.patents = (E.state.patents || 0) + gain;
  E.state.blueprints = 0; E.state.allocated = { start: true }; E.state.bpCycle = 0;
  E.freshRun(E.state); E.recomputeStats();
  buyPatents();               // bought AFTER the reset — like the real game, these land on the NEXT rebuild
  reinvestBP(); reinvestTP();
  return gain;
}
// Buy Dark Matter the way a player would: Genesis Cache first (compounds every re-climb), then the
// v0.45.0 permanent-power sink, then the optional automations. Re-scans from the top after each buy.
function buyDM() {
  const order = ["headStart", "darkStar", "cosmicGrid", "voidMarket", "paradox", "bpAuto", "talAuto", "autoRes", "autoPat", "autoAsc"];
  let bought = true;
  while (bought) { bought = false;
    for (const id of order) { const u = E.DM_AUTO.find((x) => x.id === id); if (!u) continue;
      const l = E.state.dmUpg[id] || 0; if (l >= u.max) continue;
      if (id === "headStart" && l >= 10) continue;      // taper so it doesn't sink everything into the cache
      const c = E.dmCost(u, l);
      if ((E.state.darkMatter || 0) >= c) { E.state.darkMatter -= c; E.state.dmUpg[id] = l + 1; bought = true; break; } } }
}
const autoCount = () => E.DM_AUTO.filter((u) => u.kind === "auto" && (E.state.dmUpg[u.id] || 0) > 0).length;
const powerLvls = () => ["darkStar", "cosmicGrid", "voidMarket"].reduce((a, id) => a + (E.state.dmUpg[id] || 0), 0);

// Run one ERA: Restructure-loop until we've earned enough BP to have reached Age VIII (AGE_REQ[8]).
// Returns { sec, loops, reachedAge }. Caps to avoid runaway.
function runEra(maxSec) {
  // An era's productive ceiling is Age VIII's Blueprint gate, NOT the last age's. Ages IX–X are DM-gated
  // destinations reached across many eras, so targeting AGE_REQ[last] (12000) would just run every era into
  // the time cap and tell us nothing.
  const AGE8 = E.AGE_REQ[8];
  let sec = 0, loops = 0, pats = 0;
  E.state.stats.bpEarned = 0; // era starts with ages re-locked
  E.state.blueprints = 0; E.state.allocated = { start: true }; E.state.bpCycle = 0;
  E.state.patents = 0; E.state.patentUpg = {}; E.state.fleet = 0; E.state.launched = 0;
  E.freshRun(E.state); E.recomputeStats();
  while (sec < maxSec && E.state.stats.bpEarned < AGE8) {
    // per-loop target: chase 50% more than earned so far (same heuristic as loops.js), min 1
    const target = Math.max(1, Math.ceil(E.state.stats.bpEarned * 0.5));
    let t = 0, loopCap = 6 * 3600;
    for (; t < loopCap && sec < maxSec; t++, sec++) { tick(); if (E.bpFor(E.state.runCredits) >= target) break; }
    restructure(); loops++;
    pats += maybePatent(E.state.stats.bpEarned / AGE8) > 0 ? 1 : 0;   // the preservation layer, modelled (v0.46.0)
    if (E.bpFor(E.state.runCredits) < 1 && E.state.stats.bpEarned < AGE8 && t >= loopCap) break; // dead stall
  }
  return { sec, loops, pats, reachedAge: E.state.maxAge, maxAge: E.state.maxAge, bpEarned: E.state.stats.bpEarned };
}

// PUSH RUN: stop restructuring, run one long sustained run, record when each age is first reached.
// This is what a player chasing the top actually does — it answers "is Age VIII reachable, and how long?"
function pushRun(maxSec) {
  E.freshRun(E.state); E.recomputeStats(); E.refreshUnlocks(true);   // re-reveal generators/machines the seeded pyramid qualifies for
  reinvestBP(); reinvestTP();   // a player pushing for the top spends their banked Blueprints first
  const firstReach = {}; let sec = 0;
  for (; sec < maxSec; sec++) {
    tick();
    const a = E.currentAge();
    if (!firstReach[a]) firstReach[a] = sec;
    if (a >= E.AGES.filter(Boolean).length) break; // reached the final age
  }
  return { sec, maxAge: E.currentAge(), firstReach, runCredits: E.state.runCredits };
}

console.log("=== FULL-GAME PACING: game-time to reach Age VIII, across Ascension eras ===");
console.log(`AGE_REQ = [${E.AGE_REQ.join(", ")}]  · AGE_DM = VIII:${E.AGE_DM[8]} IX:${E.AGE_DM[9]||"-"} X:${E.AGE_DM[10]||"-"}  · ASCEND_SCALE = ${E.ASCEND_SCALE}`);
console.log("era | era time | loops | pats | prod× | maxAge | DM(era) | dmEarned | DMpow | autos");
E.state = E.defaultState(); E.recomputeStats();
let cumSec = 0, cumDM = 0, eraToFull = null;
for (let era = 1; era <= 12; era++) {
  const r = runEra(60 * 3600); // cap 60h game-time per era so a mistuned build can't hang
  cumSec += r.sec;
  const dm = E.darkMatterAvailable();
  // Ascend: bank DM, buy automations, keep persistent bonuses (maxAge dividend, talents, milestones)
  E.state.darkMatter = (E.state.darkMatter || 0) + dm; E.state.ascensions++;
  E.state.stats.dmEarned = (E.state.stats.dmEarned || 0) + dm;   // lifetime DM — drives the gate + Ascendant Foundation
  cumDM += dm; buyDM();
  if (autoCount() === E.DM_AUTO.filter(u => u.kind === "auto").length && eraToFull === null) eraToFull = era;
  console.log(
    String(era).padStart(3) + " | " + clock(r.sec).padStart(8) + " | " + String(r.loops).padStart(5) + " | " +
    String(r.pats).padStart(4) + " | " +
    String(+E.globalRate().toFixed(1)).padStart(5) + " | " + String(r.maxAge).padStart(6) + " | " +
    String(dm).padStart(7) + " | " + String(E.state.stats.dmEarned).padStart(8) + " | " +
    String(powerLvls()).padStart(5) + " | " + String(autoCount()) + "/5");
}
console.log(`\ncumulative game-time over the eras above: ${clock(cumSec)}   ·   total Dark Matter earned: ${cumDM}`);
console.log(`all 5 optional automations owned by era: ${eraToFull || "not yet"}`);

// Now: with the mature meta built above, can a dedicated PUSH RUN reach the top?
console.log(`\n=== PUSH RUN (no restructuring) with the mature meta from era ${12} ===`);
const push = pushRun(72 * 3600);
console.log(`reached Age ${push.maxAge} (of ${E.AGES.filter(Boolean).length}) in ${clock(push.sec)} · runCredits ${fmt(push.runCredits)}`);
console.log("first reached each age at:  " + Object.entries(push.firstReach).map(([a, s]) => `${E.ROMAN[a]}=${clock(s)}`).join("  "));
// Diagnose the ceiling: what's capping production at the top?
const lp = E.lastPower;
console.log(`\nCEILING DIAGNOSIS at end of push run:`);
console.log(`  power: supply=${fmt(lp.supply)}MW demand=${fmt(lp.demand)}MW ratio=${(lp.ratio*100).toFixed(0)}% · globalRate=${E.globalRate().toFixed(1)}× · tree ${Object.keys(E.state.allocated).length-1}/${Object.keys(E.NODES).length} nodes · fleet=${fmt(E.state.fleet)} · swarm=${E.state.dysonSwarm}`);
console.log(`  generators: ` + E.GORDER.map(g => `${g}=${E.state.generators[g]||0}`).join("  ") + `  · patents: ` + E.PATENTS.map(p=>`${p.id}=${E.state.patentUpg[p.id]||0}`).join(" "));
const topMach = ["dysonFoundry","antimatterReactor","starScoop","quantumFab","matrioshka","realityCompiler"];
console.log(`  top machines built: ` + topMach.map(k => `${k}=${E.state.machines[k]||0}`).join("  "));
const topItems = ["hydrogen","antimatter","dysonPanel","qubit","simMatter","realityShard"];
console.log(`  top items (have/cap): ` + topItems.map(k => `${k}=${Math.floor(E.state.items[k]||0)}/${E.capOf(k)}`).join("  "));
// What is actually blocking the climb? For each tier, report unlock state and whether inputs are flowing.
const AGES_N = E.AGE_REQ.length - 1;
console.log(`  age gates: bpEarned=${fmt(E.state.stats.bpEarned)} dmEarned=${E.state.stats.dmEarned} · ` +
  Array.from({ length: AGES_N }, (_, i) => i + 1).map(a => `${E.ROMAN[a]}${E.ageUnlocked(a) ? "✓" : "✗"}`).join(" "));
console.log("  frontier machines (highest 8 by tier):");
for (const k of E.MORDER.slice(-8)) {
  const m = E.MACHINES[k], req = m.unlock || {};
  const missing = Object.keys(req).filter(r => (E.state.machines[r] || 0) < req[r]).map(r => `${r}<${req[r]}`);
  const starved = Object.keys(m.in || {}).filter(r => (E.state.items[r] || 0) < 1);
  console.log(`    t${m.t} ${k}: built=${E.state.machines[k]||0} unlocked=${!!E.state.unlocked[k]}` +
    ` ageGate=${E.ageUnlocked(E.TIER_AGE[m.t]) ? "ok" : "LOCKED"}` +
    (missing.length ? ` needs:${missing.join(",")}` : "") + (starved.length ? ` starved:${starved.join(",")}` : ""));
}
console.log(`(human wall-clock is est. ~2–3× the game-time, and this AI plays optimally with no idle gaps.)`);
