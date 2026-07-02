// Balance / pacing probe — plays COGWORKS with a simple greedy strategy and reports the curve.
// Run with: node test/balance.js   (approximate "reasonable player", not optimal)
const { loadEngine } = require("./harness");
const E = loadEngine();

const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : Math.floor(n).toString();
const clock = (s) => s < 60 ? s + "s" : s < 3600 ? (s / 60).toFixed(1) + "m" : (s / 3600).toFixed(2) + "h";

function sellAll(id) { const a = E.state.items[id] || 0; if (a > 0) { E.addCredits(a * E.ITEMS[id].sell * E.marketMult()); E.state.items[id] = 0; } }

// Sell surplus (above a reserve kept for build BOMs) of the highest-tier item not consumed by a
// built machine — models a player converting excess end-product to cash without starving their chain.
const RESERVE = 40;
function sellSurplus() {
  const consumed = new Set();
  for (const k of E.MORDER) if ((E.state.machines[k] || 0) > 0) for (const r in E.MACHINES[k].in) consumed.add(r);
  for (const id in E.ITEMS) { if (!E.itemUnlocked(id) || consumed.has(id)) continue; const q = (E.state.items[id] || 0) - RESERVE; if (q > 0) { E.addCredits(q * E.ITEMS[id].sell * E.marketMult()); E.state.items[id] = RESERVE; } }
}

function buyOne(planFn, apply) { const p = planFn(); if (p.n > 0) { const ok = tryPay(p, apply); return ok; } return false; }
function tryPay(p, apply) { apply(p); return true; }

function strategize() {
  const s = E.state;
  const hasFurnace = (s.machines.ironFurnace || 0) > 0;
  // bootstrap: before a furnace, sell raw ore; after, sell surplus end-product keeping a build reserve
  if (!hasFurnace) sellAll("ironOre"); else sellSurplus();
  // progress: buy 1 of each unlocked-but-unbuilt producer to open the tech tree
  for (const k of E.MORDER) {
    if (!s.unlocked[k] || (s.machines[k] || 0) > 0) continue;
    const p = E.planMachine(k, 1), bom = E.scaleBOM(E.buildBOM(k), p.n);
    if (p.n > 0 && E.canAfford(p.cost, bom)) { E.pay(p.cost, bom); s.machines[k] += p.n; s.stats.built += p.n; E.refreshUnlocks(true); }
  }
  // power FIRST: fund generators before scaling machines (a competent player keeps the grid up)
  if (E.lastPower.ratio < 1) { for (let i = 0; i < 40; i++) { let best = null, score = -1;
    for (const g of E.GORDER) { if (!E.genUnlocked(g)) continue; const p = E.planGenerator(g, 1); if (p.n <= 0) continue; const bom = E.scaleBOM(E.GENERATORS[g].build.bom, p.n); if (!E.canAfford(p.cost, bom)) continue; const sc = E.GENERATORS[g].power * (E.GENERATORS[g].fuel ? 1 : 10); if (sc > score) { score = sc; best = { g, p, bom }; } }
    if (!best) break; E.pay(best.p.cost, best.bom); s.generators[best.g] += best.p.n; } }
  // storage: add a warehouse when anything is capped
  for (const id in E.ITEMS) { if (E.itemUnlocked(id) && (s.items[id] || 0) >= E.capOf(id) - 1e-6) { const p = E.planWarehouse(1); if (p.n > 0 && E.canAfford(p.cost, E.scaleBOM(E.WAREHOUSE.bom, p.n))) { E.pay(p.cost, E.scaleBOM(E.WAREHOUSE.bom, p.n)); s.warehouses += p.n; } break; } }
  // scale: spend remaining credits on the cheapest affordable unlocked producer
  for (let i = 0; i < 12; i++) {
    let best = null, bc = Infinity;
    for (const k of E.MORDER) { if (!s.unlocked[k]) continue; const p = E.planMachine(k, 1); if (p.n > 0 && p.cost < bc && E.canAfford(p.cost, E.scaleBOM(E.buildBOM(k), 1))) { bc = p.cost; best = k; } }
    if (!best) break;
    const p = E.planMachine(best, 1), bom = E.scaleBOM(E.buildBOM(best), p.n);
    E.pay(p.cost, bom); s.machines[best] += p.n; s.stats.built += p.n; E.refreshUnlocks(true);
  }
}

function run(maxSeconds) {
  E.state = E.defaultState(); E.recomputeStats();
  const log = {}, mark = (k) => { if (log[k] === undefined) log[k] = t; };
  let t = 0, lastCredits = 0;
  for (t = 0; t < maxSeconds; t++) {
    E.state.items.ironOre = Math.min(E.capOf("ironOre"), (E.state.items.ironOre || 0) + E.orePerClick()); // light manual mining
    E.state.stats.produced += E.orePerClick();
    strategize();
    lastCredits = E.state.credits;
    E.simulate(1, 1); E.grantTP(); E.refreshUnlocks(true); E.checkMilestones();
    if ((E.state.machines.ironFurnace || 0) > 0) mark("first furnace");
    if ((E.state.machines.gearPress || 0) > 0) mark("first gear press");
    if ((E.state.machines.circuitFab || 0) > 0) mark("first circuit fab");
    if ((E.state.machines.assembler || 0) > 0) mark("first assembler");
    if ((E.state.machines.robotAssembler || 0) > 0) mark("first robot assembler");
    if ((E.state.items.robot || 0) > 0) mark("first robot");
    if (E.lastPower.demand > 0 && E.lastPower.ratio < 0.999) mark("power first throttles");
    if ((E.state.generators.steam || 0) > 0) mark("first steam engine");
    if (E.state.talentPoints > 0) mark("first talent point");
    if (E.state.runCredits >= E.PRESTIGE_SCALE) mark("prestige available (1 BP)");
  }
  return { log, t, credits: E.state.credits, cps: E.state.credits - lastCredits, machines: Object.values(E.state.machines).reduce((a, b) => a + b, 0), tp: E.state.talentPoints, bp: E.bpFor(E.state.runCredits), power: E.lastPower };
}

const r = run(6 * 3600);
console.log("=== COGWORKS pacing (greedy reinvest strategy) ===\n");
const order = ["first furnace", "first gear press", "prestige available (1 BP)", "first circuit fab", "first assembler", "power first throttles", "first steam engine", "first robot assembler", "first robot", "first talent point"];
for (const k of order) console.log(`  ${k.padEnd(30)} ${log_(r, k)}`);
function log_(r, k) { return r.log[k] === undefined ? "—" : clock(r.log[k]); }
console.log(`\n  reached t=${clock(r.t)} · ${fmt(r.credits)} credits · ~${fmt(r.cps)}/s · ${r.machines} machines · ${r.tp} TP · would yield ${r.bp} BP`);
console.log(`  power at end: ${Math.round(r.power.ratio * 100)}% (${fmt(r.power.supply)}/${fmt(r.power.demand)} MW)`);
