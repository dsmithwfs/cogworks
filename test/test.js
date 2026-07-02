// COGWORKS test suite — run with: node test/test.js
const { loadEngine } = require("./harness");
const E = loadEngine();

let pass = 0, fail = 0;
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log(`  ✗ ${name}${detail ? "  → " + detail : ""}`); }
}
function eq(name, a, b) { ok(name, a === b, `expected ${b}, got ${a}`); }
function near(name, a, b, eps) { ok(name, approx(a, b, eps), `expected ~${b}, got ${a}`); }
function fresh() { E.state = E.defaultState(); E.recomputeStats(); return E.state; }

// ---------------------------------------------------------------- data integrity
(() => {
  const s = fresh();
  eq("version present", typeof E.VERSION, "string");
  eq("producer machine count", E.MORDER.length, 26);
  eq("item count", Object.keys(E.ITEMS).length, 24);
  ok("alloy branch exists", !!E.ITEMS.alloy && !!E.MACHINES.alloyFurnace);
  ok("concrete branch exists", !!E.ITEMS.concrete && !!E.MACHINES.cementKiln);
  ok("foundry interconnects alloy->steel", E.MACHINES.foundry && E.MACHINES.foundry.in.alloy && E.MACHINES.foundry.out.steel);
  ok("motor branch exists", !!E.ITEMS.motor && !!E.MACHINES.motorWinder);
  ok("gearworks: alt mechanism route via motor (no circuit)", E.MACHINES.gearworks && E.MACHINES.gearworks.in.motor && E.MACHINES.gearworks.out.mechanism && !E.MACHINES.gearworks.in.circuit);
  eq("generator count", E.GORDER.length, 3);
  ok("tree has ~56 nodes", Object.keys(E.NODES).length >= 55);
  eq("milestone count", E.MILESTONES.length, 18);
  eq("talent count", E.TALENTS.length, 9);
  eq("fresh: only Core allocated", Object.keys(s.allocated).length, 1);
  eq("fresh: base multipliers", E.globalRate(), 1);
})();

// ---------------------------------------------------------------- simulation: every recipe outputs
(() => {
  for (const key of E.MORDER) {
    fresh();
    const m = E.MACHINES[key];
    E.state.unlocked[key] = true; E.state.machines[key] = 1;
    for (const r in m.in) E.state.items[r] = 1e5;
    const out = Object.keys(m.out)[0]; E.state.items[out] = 0;
    E.simulate(1, 1);
    ok(`recipe ${key} produces`, E.state.items[out] > 0, `got ${E.state.items[out]}`);
  }
})();

// ---------------------------------------------------------------- backpressure
(() => {
  fresh();
  E.state.unlocked.ironFurnace = true; E.state.machines.ironFurnace = 5;
  E.state.items.ironOre = 1e5; E.state.items.coal = 1e5;
  E.state.items.ironPlate = E.capOf("ironPlate");
  const oreBefore = E.state.items.ironOre;
  E.simulate(1, 1);
  near("backpressure: plate pinned at cap", E.state.items.ironPlate, E.capOf("ironPlate"));
  near("backpressure: inputs not wasted", E.state.items.ironOre, oreBefore);
})();

// ---------------------------------------------------------------- power grid
(() => {
  const G = E.BASE_GRID;
  fresh(); E.state.machines.miner = G + 50; E.state.items.ironOre = 0; E.simulate(1, 1);
  near("power: under-supply throttles output", E.state.items.ironOre, G); // demand=count, output=count*(G/count)=G

  fresh(); E.state.machines.miner = G + 20; E.state.generators.steam = 1; E.state.items.coal = 1000;
  const c0 = E.state.items.coal; E.simulate(1, 1);
  near("power: steam burns only needed coal", c0 - E.state.items.coal, 20 / 25, 1e-6); // 20 MW gap, 0.8 coal

  fresh(); E.state.machines.miner = G + 50; E.state.generators.solar = 1; E.state.items.coal = 1000;
  const c1 = E.state.items.coal; E.simulate(1, 1);
  near("power: solar is fuel-free", c1 - E.state.items.coal, 0);

  fresh(); E.state.machines.miner = G + 50; E.state.generators.steam = 5; E.state.items.coal = 0;
  E.state.items.ironOre = 0; E.simulate(1, 1);
  near("power: no-coal falls back to base grid", E.state.items.ironOre, G);
})();

// ---------------------------------------------------------------- batch planning
(() => {
  fresh(); E.state.credits = 1e9;
  eq("batch x10 miner count", E.planMachine("miner", 10).n, 10);
  fresh(); E.state.credits = 1e9; E.state.items.ironPlate = 12;
  eq("batch max component-limited", E.planMachine("copperMiner", "max").n, 2); // 12/5
  fresh(); E.state.credits = 100;
  eq("batch max credit-limited", E.planMachine("miner", "max").n, 4);
})();

// ---------------------------------------------------------------- prestige curve
(() => {
  fresh();
  eq("bp at $10k", E.bpFor(1e4), 1);
  eq("bp at $100k", E.bpFor(1e5), 3);
  eq("bp at $1M", E.bpFor(1e6), 15);
  eq("bp at $100M", E.bpFor(1e8), 251);
})();

// ---------------------------------------------------------------- migration
(() => {
  const migrated = E.migrate({ blueprints: 5, research: { automation: 3, bpYield: 1 } });
  eq("migrate: refund old research", migrated.blueprints, 14); // 5 + (1+1+2) + 5
  ok("migrate: research dropped", !("research" in migrated));
  ok("migrate: start allocated", !!migrated.allocated.start);
  ok("migrate: talents reset", Object.keys(migrated.talents).length === 0);
  ok("migrate: stats.produced exists", typeof migrated.stats.produced === "number");
})();

// ---------------------------------------------------------------- stat aggregation + domain split
(() => {
  const treeStats = new Set(), talStats = new Set();
  for (const id in E.NODES) for (const k in E.NODES[id].eff) treeStats.add(k);
  for (const t of E.TALENTS) for (const k in t.per) talStats.add(k);
  const overlap = [...treeStats].filter((k) => talStats.has(k));
  eq("domain split: zero stat overlap", overlap.length, 0);
  const efficiency = ["input", "fuel", "build", "mkcost", "rawcost"];
  eq("domain split: no efficiency in tree", [...treeStats].filter((k) => efficiency.includes(k)).length, 0);
  ok("domain split: talents are all efficiency", [...talStats].every((k) => efficiency.includes(k)));

  fresh(); E.state.allocated["ind_1"] = true; E.recomputeStats();
  near("tree node feeds globalRate", E.globalRate(), 1.08);
})();

// ---------------------------------------------------------------- raw-cost reduction (talents)
(() => {
  fresh(); E.state.unlocked.ironFurnace = true; E.state.machines.ironFurnace = 1;
  E.state.items.ironOre = 1000; E.state.items.coal = 1000; E.state.items.ironPlate = 0;
  const o0 = E.state.items.ironOre; E.simulate(1, 1);
  near("baseline furnace uses 2 ore", o0 - E.state.items.ironOre, 2);

  fresh(); E.state.talents = { extract: 5 }; E.recomputeStats();
  near("rawEff at extract 5", E.rawEff(), 0.85);
  E.state.unlocked.ironFurnace = true; E.state.machines.ironFurnace = 1;
  E.state.items.ironOre = 1000; E.state.items.coal = 1000; E.state.items.ironPlate = 0;
  const o1 = E.state.items.ironOre; E.simulate(1, 1);
  near("raw cost cut applies to tier-0", o1 - E.state.items.ironOre, 1.7);

  fresh(); E.state.talents = { extract: 10 }; E.recomputeStats();
  E.state.unlocked.gearPress = true; E.state.machines.gearPress = 1;
  E.state.items.ironPlate = 1000; E.state.items.gear = 0;
  const p0 = E.state.items.ironPlate; E.simulate(1, 1);
  near("raw cut spares tier-1 inputs", p0 - E.state.items.ironPlate, 2);
})();

// ---------------------------------------------------------------- talent tier gating + TP earning
(() => {
  fresh();
  ok("tier 2 locked at start", !E.tierUnlocked(2));
  eq("talentCost extract r0", E.talentCost(E.TALENTS.find((t) => t.id === "extract"), 0), 1);

  fresh();
  E.state.stats.produced = 10000; E.grantTP();
  eq("TP earned from 10k produced", E.state.talentPoints, 10);
  E.state.stats.produced = 40000; E.grantTP();
  eq("TP drips further", E.state.talentPoints, 20);
})();

// ---------------------------------------------------------------- milestones latch + reward
(() => {
  fresh(); E.state.lifetimeCredits = 1e6; E.checkMilestones();
  ok("milestone c1 latched", !!E.state.milestones.c1);
  ok("milestone c2 latched", !!E.state.milestones.c2);
  near("milestone reward feeds globalRate", E.globalRate(), 1.02); // c1 = +2% prod
  E.freshRun(E.state);
  ok("milestones survive prestige", !!E.state.milestones.c1);
})();

// ---------------------------------------------------------------- patents (deep prestige)
(() => {
  fresh();
  ok("patents locked at start", !E.patentsUnlocked());
  E.state.stats.bpEarned = E.PATENT_UNLOCK;
  ok("patents unlock at threshold", E.patentsUnlocked());

  fresh(); E.state.bpCycle = E.PATENT_SCALE * 9; // sqrt(9)=3, scale-independent
  eq("patent gain from cycle", E.patentAvailable(), 3);

  fresh(); E.state.patentUpg = { legacy: 2 }; E.recomputeStats(); // +25% prod/lvl
  near("patent upgrade feeds globalRate", E.globalRate(), 1.5);

  // patent upgrade cost scales
  eq("patent cost legacy L0", E.patentCost(E.PATENTS.find((p) => p.id === "legacy"), 0), 1);
  eq("patent cost grants L0", E.patentCost(E.PATENTS.find((p) => p.id === "grants"), 0), 2);

  // File Patent effect (replicated): wipes blueprints/tree, keeps patents/talents/patentUpg
  fresh();
  E.state.blueprints = 40; E.state.allocated = { start: true, ind_1: true }; E.state.talents = { extract: 3 };
  E.state.patents = 5; E.state.patentUpg = { legacy: 1 }; E.state.bpCycle = 200;
  const keptPatents = E.state.patents, keptTalent = E.state.talents.extract, keptUpg = E.state.patentUpg.legacy;
  // simulate the reset that doFilePatent performs
  E.state.patents += E.patentAvailable(); E.state.blueprints = 0; E.state.allocated = { start: true }; E.state.bpCycle = 0; E.freshRun(E.state);
  ok("file patent: blueprints wiped", E.state.blueprints === 0);
  ok("file patent: tree reset to core", Object.keys(E.state.allocated).length === 1);
  ok("file patent: talents kept", E.state.talents.extract === keptTalent);
  ok("file patent: patent upgrades kept", E.state.patentUpg.legacy === keptUpg);
  ok("file patent: patents grew", E.state.patents > keptPatents);
})();

// ---------------------------------------------------------------- ages
(() => {
  fresh();
  eq("fresh: current age is 1", E.currentAge(), 1);
  E.state.machines.gearPress = 1;                        // tier 2 -> Age II
  eq("gear press -> Age II", E.currentAge(), 2);
  E.state.machines.aiFoundry = 1;                        // tier 6 -> Age VI
  eq("AI foundry -> Age VI", E.currentAge(), 6);
  eq("6 ages defined", E.AGES.filter(Boolean).length, 6);

  // permanent per-age dividend feeds production via maxAge
  fresh(); E.state.maxAge = 4; E.recomputeStats();
  near("age dividend: maxAge 4 -> +30% prod", E.globalRate(), 1.30);
  fresh(); E.state.maxAge = 1; E.recomputeStats();
  near("age dividend: age 1 gives nothing", E.globalRate(), 1.0);

  // maxAge persists a Restructure, current age resets
  fresh(); E.state.maxAge = 5; E.state.machines.assembler = 1;
  E.freshRun(E.state);
  eq("freshRun resets current age", E.state.age, 1);
  eq("freshRun keeps maxAge", E.state.maxAge, 5);
})();

// ---------------------------------------------------------------- robotic workforce (Age V signature)
(() => {
  fresh();
  near("workforce bonus at 0", E.workforceBonus(), 0);
  E.state.deployed = 100; near("workforce bonus √100×0.05", E.workforceBonus(), 0.5);
  E.recomputeStats(); near("workforce feeds globalRate", E.globalRate(), 1.5);

  // deploy moves robots from stock to workforce and boosts production
  fresh(); E.state.items.robot = 50; E.deployRobots(30);
  eq("deploy: robots moved out of stock", E.state.items.robot, 20);
  eq("deploy: workforce grew", E.state.deployed, 30);
  ok("deploy: production boosted", E.globalRate() > 1);

  // recall returns robots (respecting cap)
  E.recallRobots(10);
  eq("recall: workforce shrank", E.state.deployed, 20);
  eq("recall: robots returned to stock", E.state.items.robot, 30);

  // workforce is per-run — resets on Restructure
  E.freshRun(E.state);
  eq("freshRun resets workforce", E.state.deployed, 0);
})();

// ---------------------------------------------------------------- accumulators (Age III signature)
(() => {
  // surplus charges the bank (up to capacity)
  fresh(); E.state.accumulators = 2; E.state.charge = 0; E.state.machines.miner = 10; // demand 10 << 200 grid
  E.computePower(1);
  near("accumulator: banks surplus to cap", E.state.charge, 2 * E.ACCUMULATOR.cap); // capped at 160

  // deficit discharges to cover, keeping ratio at 1 while charge lasts
  fresh(); E.state.accumulators = 5; E.state.charge = 5 * E.ACCUMULATOR.cap; E.state.machines.miner = 300; // demand 300 > 200 grid
  const r1 = E.computePower(1);
  near("accumulator: covers spike (ratio ~1)", r1, 1);
  near("accumulator: drained by the deficit", E.state.charge, 5 * E.ACCUMULATOR.cap - 100); // covered 100 MW·s

  // when nearly empty it only partially covers
  fresh(); E.state.accumulators = 5; E.state.charge = 50; E.state.machines.miner = 300;
  const r2 = E.computePower(1);
  near("accumulator: partial cover when low", r2, (200 + 50) / 300); // 0.833

  // no accumulators => no charge, throttles as before
  fresh(); E.state.machines.miner = 300; const r3 = E.computePower(1);
  near("no accumulator: throttles", r3, 200 / 300);

  // per-run: resets on Restructure
  fresh(); E.state.accumulators = 4; E.state.charge = 100; E.freshRun(E.state);
  eq("freshRun resets accumulators", E.state.accumulators, 0);
  eq("freshRun resets charge", E.state.charge, 0);
})();

// ---------------------------------------------------------------- Auto-Balance (Age IV signature)
(() => {
  // set up: auto unlocked, Age IV, two flagged machines — Miner (empty output) vs Iron Furnace (full output)
  fresh();
  E.state.allocated["eng_3_s1"] = true; E.recomputeStats();   // Auto-Builder node
  E.state.autoOn = true; E.state.autoBalance = true; E.state.maxAge = 4; E.state.credits = 1e9;
  E.state.unlocked.miner = true; E.state.unlocked.ironFurnace = true;
  E.state.auto = { miner: true, ironFurnace: true };
  E.state.items.ironOre = 0;                                   // miner's output empty (starved downstream)
  E.state.items.ironPlate = E.capOf("ironPlate");             // furnace's output full (not needed)
  E.autoBuild();
  ok("auto-balance targets the starved machine", E.state.machines.miner > 0);
  eq("auto-balance skips the full-output machine", E.state.machines.ironFurnace, 0);

  // with balance OFF it buys 1 of each flagged instead
  fresh();
  E.state.allocated["eng_3_s1"] = true; E.recomputeStats();
  E.state.autoOn = true; E.state.autoBalance = false; E.state.maxAge = 4; E.state.credits = 1e9;
  E.state.unlocked.miner = true; E.state.unlocked.ironFurnace = true;
  E.state.auto = { miner: true, ironFurnace: true };
  E.state.items.ironPlate = E.capOf("ironPlate");
  E.autoBuild();
  eq("plain auto buys 1 miner", E.state.machines.miner, 1);
  eq("plain auto buys 1 furnace", E.state.machines.ironFurnace, 1);
})();

// ---------------------------------------------------------------- wider chains: Foundry interconnect
(() => {
  fresh(); E.state.unlocked.foundry = true; E.state.machines.foundry = 1;
  E.state.items.alloy = 100; E.state.items.coal = 100; E.state.items.ironPlate = 0; E.state.items.steel = 0;
  E.simulate(1, 1);
  ok("foundry makes steel from alloy alone (no iron plates)", E.state.items.steel > 0 && E.state.items.ironPlate === 0);
  near("foundry consumes 1 alloy per steel", 100 - E.state.items.alloy, E.state.items.steel);

  // gearworks: mechanisms from motors + gears, consuming NO circuits
  fresh(); E.state.unlocked.gearworks = true; E.state.machines.gearworks = 1;
  E.state.items.motor = 100; E.state.items.gear = 100; E.state.items.circuit = 50; E.state.items.mechanism = 0;
  E.simulate(1, 1);
  ok("gearworks makes mechanisms from motors", E.state.items.mechanism > 0);
  eq("gearworks leaves circuits untouched", E.state.items.circuit, 50);
})();

// ---------------------------------------------------------------- age goals
(() => {
  eq("6 age goals defined", E.AGE_GOALS.filter(Boolean).length, 6);

  // completing a goal (cumulative production of its key item) latches it + grants its reward
  fresh();
  E.state.stats.made = { ironPlate: 5000 };          // Age I goal: 5,000 iron plates
  E.checkAgeGoals();
  ok("age I goal latched at threshold", !!E.state.ageGoals[1]);
  near("age I reward feeds globalRate (+15%)", E.globalRate(), 1.15);

  // not yet met -> not latched
  fresh();
  E.state.stats.made = { ironPlate: 4999 };
  E.checkAgeGoals();
  ok("age I goal not latched below threshold", !E.state.ageGoals[1]);

  // themed reward: Age III (circuits) boosts generator output, not production
  fresh();
  E.state.stats.made = { circuit: 3000 };
  E.checkAgeGoals();
  ok("age III goal latched", !!E.state.ageGoals[3]);
  near("age III reward feeds genMult (+50%)", E.genMult(), 1.5);
  near("age III reward does not touch production", E.globalRate(), 1.0);

  // per-item production is tracked by simulate
  fresh(); E.state.unlocked.miner = true; E.state.machines.miner = 3; E.state.items.ironOre = 0;
  E.simulate(1, 1);
  near("simulate tracks per-item production", E.state.stats.made.ironOre, 3);

  // goals persist across Restructure (latched permanently)
  fresh(); E.state.ageGoals[2] = true; E.freshRun(E.state);
  ok("age goals survive Restructure", !!E.state.ageGoals[2]);
})();

// ---------------------------------------------------------------- sound (polish)
(() => {
  fresh();
  eq("sound defaults on", E.state.sound, true);
  ok("migrate keeps sound=false", E.migrate({ sound: false }).sound === false);
  ok("migrate defaults sound=true", E.migrate({}).sound === true);
  // SFX must be a safe no-op with no AudioContext (so engine calls never throw in the sim/tests)
  let threw = false; try { E.SND.build(); E.SND.prestige(); E.SND.goal(); } catch (e) { threw = true; }
  ok("SND calls are safe without an AudioContext", !threw);
})();

// ---------------------------------------------------------------- session HUD helpers
(() => {
  fresh();
  eq("hud defaults off", E.state.hud, false);
  ok("migrate keeps hud", E.migrate({ hud: true }).hud === true);

  // bottleneck = the consumed item whose buffer is emptiest
  fresh();
  E.state.machines.ironFurnace = 1; E.state.machines.gearPress = 1;  // furnace consumes ore/coal, press consumes plate
  E.state.items.ironOre = E.capOf("ironOre"); E.state.items.coal = E.capOf("coal");
  E.state.items.ironPlate = 5;                                        // plate nearly empty → the bottleneck
  const b = E.bottleneck();
  eq("bottleneck finds the emptiest consumed item", b.item ? b.item : b.id, "ironPlate");

  // chain health: a starved machine is counted
  fresh();
  E.state.unlocked.gearPress = true; E.state.machines.gearPress = 1; E.state.items.ironPlate = 0; // starved of input
  ok("chainHealth flags a starved machine", E.chainHealth().starved >= 1);
})();

// ---------------------------------------------------------------- smelter lever (Blast Furnace)
(() => {
  // baseline: 1 fed Iron Furnace makes ~1 plate/s at Mk0 with no bonuses
  fresh();
  E.state.machines.ironFurnace = 1; E.state.items.ironOre = 100; E.state.items.coal = 100;
  E.simulate(1, 1);
  const base = E.state.items.ironPlate;
  ok("baseline furnace output is ~1 plate/s", base > 0.9 && base < 1.1);

  // with the Blast Furnace node allocated, smelter output rises ~50%
  fresh();
  E.state.allocated["ind_2_s0"] = true; E.recomputeStats();
  ok("Blast Furnace node grants the smelt stat", E.st("smelt") > 0.49);
  E.state.machines.ironFurnace = 1; E.state.items.ironOre = 100; E.state.items.coal = 100;
  E.simulate(1, 1);
  const boosted = E.state.items.ironPlate;
  ok("smelt lever lifts smelter output ~50%", boosted > base * 1.45 && boosted < base * 1.55);

  // the lever is smelter-ONLY: a non-smelter (Gear Press) is unaffected
  fresh();
  E.state.allocated["ind_2_s0"] = true; E.recomputeStats();
  E.state.unlocked.gearPress = true; E.state.machines.gearPress = 1; E.state.items.ironPlate = 100;
  E.simulate(1, 1);
  ok("smelt lever does NOT boost non-smelters", (E.state.items.gear || 0) > 0.95 && (E.state.items.gear || 0) < 1.05);
})();

// ---------------------------------------------------------------- trade terminal: sell overstock
(() => {
  // With a terminal in overstock mode, an item pinned at its cap gets its surplus (above 90%) sold,
  // while an item below the 90% floor is left untouched.
  fresh();
  E.state.markets = 1; E.state.marketMk = 0; E.state.marketItem = E.MARKET_OVERSTOCK;
  const oreCap = E.capOf("ironOre");
  E.state.items.ironOre = oreCap;                 // fully overstocked
  E.state.items.coal = E.capOf("coal") * 0.5;     // below the 90% floor
  const cr0 = E.state.credits;
  E.simulate(1, 1);
  ok("overstock sells the full buffer's surplus", E.state.items.ironOre < oreCap);
  ok("overstock never sells below the 90% floor", E.state.items.ironOre >= oreCap * E.OVERSTOCK_KEEP - 1e-6);
  ok("overstock leaves non-overstocked items alone", Math.abs(E.state.items.coal - E.capOf("coal") * 0.5) < 1e-6);
  ok("overstock earns credits", E.state.credits > cr0);

  // Throughput is bounded by the terminal (1 terminal, Mk0 = 2/s), even with a huge surplus.
  fresh();
  E.state.markets = 1; E.state.marketMk = 0; E.state.marketItem = E.MARKET_OVERSTOCK;
  const before = E.state.items.ironOre = E.capOf("ironOre");
  E.simulate(1, 1);
  ok("overstock respects terminal throughput (<=2/s at Mk0)", before - E.state.items.ironOre <= 2 + 1e-6);

  // Single-item mode still works unchanged (regression guard).
  fresh();
  E.state.markets = 1; E.state.marketItem = "ironOre"; E.state.items.ironOre = 100;
  const c0 = E.state.credits;
  E.simulate(1, 1);
  ok("single-item sell still works", E.state.items.ironOre < 100 && E.state.credits > c0);
})();

// ---------------------------------------------------------------- talents persist across reload (migrate)
(() => {
  // Simulate a saved game with purchased talents, then load it (migrate) as a page refresh would.
  const saved = E.defaultState();
  saved.talents = { extract: 4, master: 2 };
  saved.talentPoints = 9;
  saved.tpClaimed = 31;
  const loaded = E.migrate(JSON.parse(JSON.stringify(saved)));   // JSON round-trip mimics localStorage
  ok("reload preserves talent ranks", loaded.talents.extract === 4 && loaded.talents.master === 2);
  ok("reload preserves unspent talentPoints", loaded.talentPoints === 9);
  ok("reload preserves tpClaimed (so grantTP won't re-grant)", loaded.tpClaimed === 31);

  // Legacy save missing the fields falls back gracefully (no crash, points derived from production).
  const legacy = E.defaultState(); delete legacy.talents; delete legacy.talentPoints; delete legacy.tpClaimed;
  legacy.stats.produced = 40000;
  const lg = E.migrate(JSON.parse(JSON.stringify(legacy)));
  ok("legacy save migrates without losing state", typeof lg.talentPoints === "number" && typeof lg.talents === "object");
})();

// ---------------------------------------------------------------- workforce power upkeep (Age V)
(() => {
  fresh();
  E.state.machines.ironFurnace = 5;               // some baseline machine demand
  E.computePower(1);
  const d0 = E.lastPower.demand;
  E.state.deployed = 100;                          // field a workforce
  E.computePower(1);
  const d1 = E.lastPower.demand;
  ok("deployed robots add grid demand", Math.abs((d1 - d0) - 100 * E.WORKFORCE_MW) < 1e-6);
  ok("workforceDraw = deployed * WORKFORCE_MW", Math.abs(E.workforceDraw() - 100 * E.WORKFORCE_MW) < 1e-6);

  // linear upkeep vs √ benefit => the marginal robot costs more power than it returns bonus at scale
  E.state.deployed = 400;  const b400 = E.workforceBonus(), p400 = E.workforceDraw();
  E.state.deployed = 1600; const b1600 = E.workforceBonus(), p1600 = E.workforceDraw();
  ok("4x the workforce = 4x power but only 2x bonus (self-limiting)",
    Math.abs(p1600 / p400 - 4) < 1e-6 && Math.abs(b1600 / b400 - 2) < 1e-6);
})();

// ---------------------------------------------------------------- exponential cost scaling by tier
(() => {
  // Cost scaling now comes from TIER_MULT (per-tier), steepening toward the endgame to create the wall.
  ok("TIER_MULT steepens with tier", E.TIER_MULT[0] === 1.15 && E.TIER_MULT[6] === 1.55 && E.TIER_MULT[6] > E.TIER_MULT[4] && E.TIER_MULT[4] > E.TIER_MULT[2]);

  // planMachine scales the next-copy unit price at the item's TIER_MULT
  const check = (key, mult) => {
    fresh(); E.state.unlocked[key] = true;
    E.state.machines[key] = 0; const u0 = E.planMachine(key, 1).unit;
    E.state.machines[key] = 1; const u1 = E.planMachine(key, 1).unit;
    ok(`${key} scales at TIER_MULT[t${E.MACHINES[key].t}] (~${mult})`, Math.abs(u1 / u0 - mult) < 0.01);
  };
  check("gearPress", E.TIER_MULT[2]);        // 1.19
  check("robotAssembler", E.TIER_MULT[5]);   // 1.42
  check("probeAssembler", E.TIER_MULT[6]);   // 1.55

  // the endgame walls a single run: 15 Probe Assemblers cost far more than an un-prestiged run's income
  fresh(); E.state.unlocked.probeAssembler = true;
  E.state.credits = 1e11;                                          // huge purse...
  E.state.items.aiCore = 1e4; E.state.items.robot = 1e4; E.state.items.steel = 1e5;  // ...and ample BOM
  const p = E.planMachine("probeAssembler", 15);
  ok("15 probe assemblers cost > 1 billion (steep late wall)", p.cost > 1e9);
})();

// ---------------------------------------------------------------- hard age-gate (prestige required to advance)
(() => {
  // Ages I–III are free; IV+ are gated behind total Blueprints earned (a permanent, prestige-only metric).
  ok("Ages I–III are ungated", E.AGE_REQ[1] === 0 && E.AGE_REQ[2] === 0 && E.AGE_REQ[3] === 0);
  ok("Ages IV/V/VI require increasing Blueprints", E.AGE_REQ[4] > 0 && E.AGE_REQ[5] > E.AGE_REQ[4] && E.AGE_REQ[6] > E.AGE_REQ[5]);

  // With 0 Blueprints earned, an Age-IV machine can't unlock even if its prereq is built.
  fresh();
  E.state.stats.bpEarned = 0;
  E.state.machines.circuitFab = 5;            // assembler's prereq is satisfied...
  E.refreshUnlocks(true);
  ok("Age IV machine stays LOCKED with 0 Blueprints (prereq met)", !E.state.unlocked.assembler);
  ok("ageUnlocked reflects the gate", E.ageUnlocked(4) === false);

  // After earning enough Blueprints, the same machine unlocks.
  E.state.stats.bpEarned = E.AGE_REQ[4];
  E.refreshUnlocks(true);
  ok("Age IV machine unlocks once the Blueprint threshold is met", !!E.state.unlocked.assembler);

  // A machine already built/unlocked is never re-locked, even below the threshold.
  fresh();
  E.state.stats.bpEarned = 0; E.state.unlocked.assembler = true;
  ok("already-unlocked machines are never re-locked", E.machineUnlocked("assembler") === true);
})();

// ---------------------------------------------------------------- gross production tracking (▲ readout data source)
(() => {
  // The ticker's "▲X/s" production number is smoothed from per-tick deltas of stats.made, so the engine
  // must record gross machine output there — even when the buffer is full and drained downstream.
  fresh();
  E.state.machines.ironFurnace = 3; E.state.items.ironOre = 1000; E.state.items.coal = 1000;
  const b = E.state.stats.made.ironPlate || 0;
  E.simulate(1, 1);
  ok("stats.made records gross output (feeds the ▲ readout)", ((E.state.stats.made.ironPlate || 0) - b) > 2.9);

  // near-full buffer, drained by a downstream consumer: production is still recorded (the "producing while full" case)
  fresh();
  E.state.unlocked.gearPress = true;
  E.state.machines.ironFurnace = 5; E.state.machines.gearPress = 3;
  E.state.items.ironOre = 1000; E.state.items.coal = 1000;
  E.state.items.ironPlate = E.capOf("ironPlate") - 5;   // a sliver of headroom so the furnace outputs
  const b2 = E.state.stats.made.ironPlate || 0;
  E.simulate(1, 1);
  ok("production recorded even with a near-full, downstream-drained buffer", ((E.state.stats.made.ironPlate || 0) - b2) > 0);
})();

// ---------------------------------------------------------------- Age I signature: Prospecting
(() => {
  fresh();
  ok("no vein by default → prospectMult is 1", E.prospectMult() === 1);

  // Mining PROSPECT_MAX times strikes a Rich Vein and resets the meter.
  fresh();
  for (let i = 0; i < E.PROSPECT_MAX; i++) E.mine();
  ok("striking a vein sets the surge timer", E.state.veinLeft === E.VEIN_DUR);
  ok("meter resets after striking", E.state.prospect === 0);
  ok("active vein boosts raw extraction", Math.abs(E.prospectMult() - (1 + E.VEIN_BONUS)) < 1e-9);

  // The surge multiplies tier-0 (raw) output but NOT higher tiers.
  fresh();
  E.state.veinLeft = E.VEIN_DUR;
  E.state.machines.miner = 10;                 // tier 0 → boosted
  E.simulate(1, 1);
  ok("vein lifts raw miner output ~+50%", E.state.items.ironOre > 14.9 && E.state.items.ironOre < 15.1);

  fresh();
  E.state.veinLeft = E.VEIN_DUR;
  E.state.machines.ironFurnace = 10; E.state.items.ironOre = 1000; E.state.items.coal = 1000;  // tier 1 → NOT boosted
  E.simulate(1, 1);
  ok("vein does NOT boost non-raw (tier-1) output", E.state.items.ironPlate > 9.9 && E.state.items.ironPlate < 10.1);
})();

// ---------------------------------------------------------------- Age II signature: Overclock
(() => {
  fresh();
  ok("overclock off by default", !E.overclockOn() && E.ocSpeed() === 1 && E.ocInput() === 1);

  // Baseline: a fed Gear Press makes 1 gear/s from 2 plates/s.
  fresh();
  E.state.unlocked.gearPress = true; E.state.machines.gearPress = 1; E.state.items.ironPlate = 1000;
  E.simulate(1, 1);
  const baseOut = E.state.items.gear, basePlate = 1000 - E.state.items.ironPlate;
  ok("baseline gear press: 1 gear/s from 2 plate/s", Math.abs(baseOut - 1) < 1e-6 && Math.abs(basePlate - 2) < 1e-6);

  // Overclocked: +50% throughput AND +50% input per cycle → 1.5 gears/s from 4.5 plate/s.
  fresh();
  E.state.overclock = true;
  E.state.unlocked.gearPress = true; E.state.machines.gearPress = 1; E.state.items.ironPlate = 1000;
  E.simulate(1, 1);
  const ocOut = E.state.items.gear, ocPlate = 1000 - E.state.items.ironPlate;
  ok("overclock lifts throughput +50%", Math.abs(ocOut - 1.5) < 1e-6);
  ok("overclock burns +50% input per cycle (2 × 1.5 × 1.5 = 4.5)", Math.abs(ocPlate - 4.5) < 1e-6);
  ok("net effect is worse material efficiency (more plate per gear)", (ocPlate / ocOut) > (basePlate / baseOut));

  // Persists across a save/load (migrate).
  const saved = E.defaultState(); saved.overclock = true;
  ok("overclock persists through migrate", E.migrate(JSON.parse(JSON.stringify(saved))).overclock === true);
})();

// ---------------------------------------------------------------- Age VI: Von Neumann Fleet (endgame idle engine)
(() => {
  fresh();
  ok("no fleet → no bonus, no cap", E.fleetBonus() === 0 && E.fleetCap() === 0);

  // Launching probes moves them into the fleet and raises the cap.
  fresh();
  E.state.items.probe = 30;
  E.launchProbes(20);
  ok("launching consumes probes", Math.abs(E.state.items.probe - 10) < 1e-6);
  ok("launched probes join the fleet", E.state.fleet === 20 && E.state.launched === 20);
  ok("fleet cap = launched × FLEET_CAP_MULT", E.fleetCap() === 20 * E.FLEET_CAP_MULT);
  ok("fleet grants a production bonus", E.fleetBonus() > 0);
  ok("fleet feeds globalRate", E.globalRate() > 1 + 1e-9);

  // Fleet self-replicates toward the cap over time (logistic), but never exceeds it.
  fresh();
  E.state.items.probe = 100; E.launchProbes(100);   // fleet 100, cap 2000
  const f0 = E.state.fleet;
  for (let i = 0; i < 60; i++) E.simulate(1, 1);     // 60s of replication
  ok("fleet self-replicates (grows) over time", E.state.fleet > f0);
  ok("fleet never exceeds its cap", E.state.fleet <= E.fleetCap() + 1e-6);

  // Fleet is permanent — survives a save/load (migrate).
  const saved = E.defaultState(); saved.fleet = 500; saved.launched = 40;
  const loaded = E.migrate(JSON.parse(JSON.stringify(saved)));
  ok("fleet + launched persist through migrate", loaded.fleet === 500 && loaded.launched === 40);
})();

// ---------------------------------------------------------------- Ages roadmap
(() => {
  ok("a signature is labelled for every age", E.AGE_SIG.slice(1).every(s => s && s.length));

  // Fresh (0 Blueprints): the roadmap lists all six ages and flags the gated ones as locked.
  fresh();
  const html = E.ageRoadmap();
  ok("roadmap names all six ages", [1,2,3,4,5,6].every(a => html.includes(E.AGES[a].n)));
  ok("roadmap shows a lock for gated ages at 0 Blueprints", html.includes("🔒 locked"));
  ok("roadmap surfaces the Blueprint gate cost", html.includes(String(E.AGE_REQ[6])));

  // With Age IV's threshold met, it's no longer shown as locked at that tier.
  fresh(); E.state.stats.bpEarned = E.AGE_REQ[6];   // everything unlocked
  ok("roadmap has no locks once all ages are unlocked", !E.ageRoadmap().includes("🔒 locked"));
})();

// ---------------------------------------------------------------- potential production tracking (spare-capacity readout)
(() => {
  // When a buffer has space, potential output == actual output (no backpressure).
  fresh();
  E.state.machines.ironFurnace = 5; E.state.items.ironOre = 1000; E.state.items.coal = 1000;
  E.state.items.ironPlate = 0;                         // plenty of room
  const m0 = E.state.stats.made.ironPlate || 0, p0 = E.potMade.ironPlate || 0;
  E.simulate(1, 1);
  const actual = (E.state.stats.made.ironPlate || 0) - m0, pot = (E.potMade.ironPlate || 0) - p0;
  ok("with space, potential output == actual", Math.abs(pot - actual) < 1e-6 && actual > 4.9);

  // When the output buffer is FULL and nothing drains it, actual output is throttled to ~0
  // but POTENTIAL still reflects the full production the machines could achieve.
  fresh();
  E.state.machines.ironFurnace = 5; E.state.items.ironOre = 1000; E.state.items.coal = 1000;
  E.state.items.ironPlate = E.capOf("ironPlate");     // full → backpressure
  const m1 = E.state.stats.made.ironPlate || 0, p1 = E.potMade.ironPlate || 0;
  E.simulate(1, 1);
  const actualFull = (E.state.stats.made.ironPlate || 0) - m1, potFull = (E.potMade.ironPlate || 0) - p1;
  ok("full buffer throttles actual output to ~0", actualFull < 0.01);
  ok("potential output still shows the ~5/s capacity when full", potFull > 4.9 && potFull < 5.1);
  ok("spare capacity (potential − actual) is surfaced when full", (potFull - actualFull) > 4.9);
})();

// ---------------------------------------------------------------- summary
console.log(`\n${fail === 0 ? "✓ ALL PASSED" : "✗ FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
