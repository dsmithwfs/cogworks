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
  eq("producer machine count", E.MORDER.length, 32);
  eq("item count", Object.keys(E.ITEMS).length, 30);
  ok("alloy branch exists", !!E.ITEMS.alloy && !!E.MACHINES.alloyFurnace);
  ok("concrete branch exists", !!E.ITEMS.concrete && !!E.MACHINES.cementKiln);
  ok("foundry interconnects alloy->steel", E.MACHINES.foundry && E.MACHINES.foundry.in.alloy && E.MACHINES.foundry.out.steel);
  ok("motor branch exists", !!E.ITEMS.motor && !!E.MACHINES.motorWinder);
  ok("gearworks: alt mechanism route via motor (no circuit)", E.MACHINES.gearworks && E.MACHINES.gearworks.in.motor && E.MACHINES.gearworks.out.mechanism && !E.MACHINES.gearworks.in.circuit);
  eq("generator count", E.GORDER.length, 3);
  ok("tree is hand-authored (~80 focused nodes)", Object.keys(E.NODES).length >= 60 && Object.keys(E.NODES).length <= 140);
  ok("most tree nodes are non-flat (synergy/mechanic/keystone)", (() => {
    const flatKeys = new Set(["prod","cap","sell","power","grid","bp","click","smelt","offcap"]);
    let flat = 0, tot = 0;
    for (const id in E.NODES) { const n = E.NODES[id]; if (id === "start") continue; tot++;
      const keys = Object.keys(n.eff); if (keys.length === 1 && flatKeys.has(keys[0]) && n.type !== "keystone") flat++; }
    return flat / tot < 0.5;   // fewer than half are single-stat flat boosts
  })());
  eq("milestone count", E.MILESTONES.length, 18);
  eq("talent count", E.TALENTS.length, 11);
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
  near("tree node feeds globalRate", E.globalRate(), 1 + E.NODES["ind_1"].eff.prod);
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

  // Patents are the PRESERVATION layer — they must NOT sell stat multipliers (that's the tree's job,
  // and selling it worse is why the layer used to be skippable).
  fresh(); E.state.patentUpg = { priorArt: 2, grandfather: 2, chartered: 2 }; E.recomputeStats();
  near("patents add NO stat multipliers (distinct from the tree)", E.globalRate(), 1);

  // patent upgrade cost scales off each patent's base
  eq("patent cost priorArt L0", E.patentCost(E.PATENTS.find((p) => p.id === "priorArt"), 0), 3);
  eq("patent cost chartered L0", E.patentCost(E.PATENTS.find((p) => p.id === "chartered"), 0), 1);

  // ---- preservation: each patent is grandfathered into every future run (applied in freshRun) ----
  fresh(); E.state.patentUpg = { priorArt: 2 }; E.state.allocated = { start: true }; E.freshRun(E.state);
  ok("Prior Art pre-allocates the first N rings of all 6 arms",
    E.state.allocated["ind_1"] && E.state.allocated["ind_2"] && E.state.allocated["asc_2"] && !E.state.allocated["ind_3"]);

  fresh(); E.state.patentUpg = { grandfather: 3 }; E.freshRun(E.state);
  ok("Grandfathered Tooling starts every machine at Mk N", E.state.mk.miner === 3 && E.state.mk.ironFurnace === 3);

  fresh(); E.state.patentUpg = { chartered: 2, franchise: 3, vault: 2 }; E.freshRun(E.state);
  ok("Chartered Works seeds Warehouses", E.state.warehouses === 6);
  ok("Franchise Rights seeds Trade Terminals", E.state.markets === 3);
  ok("Reserve Vault seeds Credits", E.state.credits === 2500 * 4);

  // Standing Claim spares the build-prerequisite chain but must NEVER bypass an age gate
  fresh(); E.state.patentUpg = { standing: 8 }; E.state.stats.bpEarned = 0; E.state.stats.dmEarned = 0; E.freshRun(E.state);
  ok("Standing Claim unlocks the un-gated early tiers", !!E.state.unlocked.gearPress);
  ok("Standing Claim does NOT bypass a Blueprint age gate",
    E.MORDER.filter((k) => E.MACHINES[k].t >= 4).every((k) => !E.state.unlocked[k]));

  // REGRESSION (v0.46.1): pre-unlocking machines used to skip refreshUnlocks' item-reveal side effect,
  // so a Patent reset left the Items panel showing only the 3 starters while 20 machines were unlocked.
  fresh(); E.state.stats.bpEarned = 500; E.state.patentUpg = { standing: 3 };
  E.state.allocated = { start: true }; E.freshRun(E.state); E.refreshUnlocks(true);
  ok("every unlocked machine reveals its input/output items", E.MORDER.filter((k) => E.state.unlocked[k])
    .every((k) => Object.keys(E.MACHINES[k].in || {}).concat(Object.keys(E.MACHINES[k].out || {}))
      .every((r) => E.itemUnlocked(r))));
  ok("Patent reset shows far more than the 3 starting items",
    Object.keys(E.ITEMS).filter((id) => E.itemUnlocked(id)).length > 10);

  // File Patent effect (replicated): wipes blueprints/tree, keeps patents/talents/patentUpg
  fresh();
  E.state.blueprints = 40; E.state.allocated = { start: true, ind_1: true }; E.state.talents = { extract: 3 };
  E.state.patents = 5; E.state.patentUpg = { chartered: 1 }; E.state.bpCycle = 200;
  const keptPatents = E.state.patents, keptTalent = E.state.talents.extract, keptUpg = E.state.patentUpg.chartered;
  // simulate the reset that doFilePatent performs
  E.state.patents += E.patentAvailable(); E.state.blueprints = 0; E.state.allocated = { start: true }; E.state.bpCycle = 0; E.freshRun(E.state);
  ok("file patent: blueprints wiped", E.state.blueprints === 0);
  ok("file patent: tree reset to core", Object.keys(E.state.allocated).length === 1);
  ok("file patent: talents kept", E.state.talents.extract === keptTalent);
  ok("file patent: patent upgrades kept", E.state.patentUpg.chartered === keptUpg);
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
  eq("8 ages defined", E.AGES.filter(Boolean).length, 8);

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
  E.state.allocated["eng_1_s0"] = true; E.recomputeStats();   // Auto-Builder node
  E.state.autoOn = true; E.state.autoBalance = true; E.state.maxAge = 4; E.state.credits = 1e9;
  E.state.unlocked.miner = true; E.state.unlocked.ironFurnace = true;
  E.state.auto = { miner: true, ironFurnace: true };
  E.state.items.ironOre = 0;                                   // miner's output empty (starved downstream)
  E.state.items.ironPlate = E.capOf("ironPlate");             // furnace's output full (not needed)
  E.autoBuild();
  ok("auto-balance targets the starved machine", E.state.machines.miner > 0);
  eq("auto-balance skips the full-output machine", E.state.machines.ironFurnace, 0);

  // whole-factory auto-pilot: balances UNLOCKED machines even with NOTHING flagged (no per-machine opt-in)
  fresh();
  E.state.allocated["eng_1_s0"] = true; E.recomputeStats();
  E.state.autoOn = true; E.state.autoBalance = true; E.state.maxAge = 4; E.state.credits = 1e9;
  E.state.unlocked.miner = true; E.state.auto = {};            // nothing flagged
  E.state.items.ironOre = 0;                                    // miner's output empty (demanded)
  E.autoBuild();
  ok("auto-balance builds UNFLAGGED machines (whole-factory auto-pilot)", E.state.machines.miner > 0);

  // auto-pilot also adds storage when a buffer caps
  fresh();
  E.state.allocated["eng_1_s0"] = true; E.recomputeStats();
  E.state.autoOn = true; E.state.autoBalance = true; E.state.maxAge = 4; E.state.credits = 1e9;
  E.state.items.brick = 1e4;                                    // warehouse BOM
  E.state.items.ironOre = E.capOf("ironOre");                   // a buffer is capped
  const wh0 = E.state.warehouses;
  E.autoBuild();
  ok("auto-balance auto-adds storage when a buffer caps", E.state.warehouses > wh0);

  // with balance OFF it buys 1 of each flagged instead
  fresh();
  E.state.allocated["eng_1_s0"] = true; E.recomputeStats();
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
  eq("8 age goals defined", E.AGE_GOALS.filter(Boolean).length, 8);

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
  E.state.allocated["ind_5"] = true; E.recomputeStats();
  ok("Blast Furnace node grants the smelt stat", E.st("smelt") > 0.59);
  E.state.machines.ironFurnace = 1; E.state.items.ironOre = 100; E.state.items.coal = 100;
  E.simulate(1, 1);
  const boosted = E.state.items.ironPlate;
  ok("smelt lever lifts smelter output ~50%", boosted > base * 1.55 && boosted < base * 1.65);

  // the lever is smelter-ONLY: a non-smelter (Gear Press) is unaffected
  fresh();
  E.state.allocated["ind_5"] = true; E.recomputeStats();
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

// ---------------------------------------------------------------- economy Layer 1: value-add gradient
(() => {
  // Every recipe output must sell for MORE than the summed value of its inputs (markup ≥ 1) — refining always pays.
  fresh();
  const done = {};
  let worst = Infinity, worstItem = null;
  for (const key of E.MORDER) { const m = E.MACHINES[key];
    for (const o in m.out) { if (done[o]) continue; done[o] = true;
      if (!m.in || !Object.keys(m.in).length) continue;            // raw extractor
      let inVal = 0; for (const r in m.in) inVal += m.in[r] * E.ITEMS[r].sell;
      const markup = E.ITEMS[o].sell * m.out[o] / inVal;
      if (markup < worst) { worst = markup; worstItem = o; }
    }
  }
  ok("every processing step has a positive value-add markup", worst > 1.0001, `worst = ${worst.toFixed(2)}× at ${worstItem}`);
  near("markup equals VALUE_MARKUP", worst, E.VALUE_MARKUP, 0.02);
  // deriveSellValues is deterministic + idempotent (re-running doesn't drift the prices)
  const snapshot = E.MORDER.map(k => Object.keys(E.MACHINES[k].out).map(o => E.ITEMS[o].sell));
  E.deriveSellValues();
  const snapshot2 = E.MORDER.map(k => Object.keys(E.MACHINES[k].out).map(o => E.ITEMS[o].sell));
  ok("deriveSellValues is idempotent", JSON.stringify(snapshot) === JSON.stringify(snapshot2));
})();

// ---------------------------------------------------------------- economy Layer 2: market demand depth
(() => {
  fresh();
  ok("a fresh market is at full price", Math.abs(E.demandFactor("gear") - 1) < 1e-9);
  // selling saturates the market → price sags
  const depth = E.demandDepth("gear");
  E.sellValue("gear", depth * 0.5);
  ok("selling raises saturation (price sags)", E.demandFactor("gear") < 1 && E.demandFactor("gear") > E.DEMAND_FLOOR);
  // flooding hits the floor, never below
  E.sellValue("gear", depth * 5);
  ok("a flooded market bottoms out at the floor", Math.abs(E.demandFactor("gear") - E.DEMAND_FLOOR) < 1e-6);
  // a big dump earns strictly less than the same quantity at full price (the sag is real)
  fresh();
  const qty = E.demandDepth("gear");
  const full = qty * E.ITEMS.gear.sell * E.marketMult();
  const got = E.sellValue("gear", qty);
  ok("dumping a large quantity earns less than full price", got < full * 0.95);
  // markets recover over time (simulate decays saturation each tick)
  fresh();
  E.sellValue("gear", E.demandDepth("gear") * 2);       // flood it
  const sagged = E.demandFactor("gear");
  E.state.machines.miner = 1;                            // give simulate something to run
  for (let i = 0; i < 30; i++) E.simulate(1, 1);         // 30s of recovery
  ok("markets recover toward full price over time", E.demandFactor("gear") > sagged + 0.1);
  // demand is independent per item — saturating one doesn't move another
  fresh();
  E.sellValue("gear", E.demandDepth("gear") * 3);
  ok("saturation is per-item", E.demandFactor("gear") < 0.5 && Math.abs(E.demandFactor("steel") - 1) < 1e-9);
})();

// ---------------------------------------------------------------- economy Layer 3: contracts
(() => {
  fresh();
  ok("contracts locked before you're trading", !E.contractsUnlocked());
  E.state.markets = 1;
  ok("contracts unlock once you have a terminal", E.contractsUnlocked());

  // the board fills to CONTRACT_SLOTS with valid, distinct contracts
  E.state.contracts = []; E.refillContracts();
  ok("board fills to CONTRACT_SLOTS", E.state.contracts.length === E.CONTRACT_SLOTS);
  ok("every contract targets an unlocked item with a positive qty and reward",
     E.state.contracts.every(c => E.itemUnlocked(c.item) && c.qty > 0 && c.reward > 0));
  ok("contracts are for distinct items", new Set(E.state.contracts.map(c => c.item)).size === E.state.contracts.length);
  // reward is a premium over base market value
  ok("reward is a premium over base value", E.state.contracts.every(c => c.reward >= c.qty * E.ITEMS[c.item].sell * E.CONTRACT_PREMIUM[0] - 1));

  // fulfilling: needs the goods; consumes them; pays; refreshes that item's demand; refills the slot
  const c = E.state.contracts[0];
  E.state.items[c.item] = 0;
  const crBefore = E.state.credits, nBefore = E.state.contracts.length;
  E.fulfillContract(c.cid);
  ok("can't fulfill without the goods", E.state.contracts.some(x => x.cid === c.cid) && E.state.credits === crBefore);
  E.state.items[c.item] = c.qty + 5;
  E.demandSat[c.item] = 0.9;                            // pretend this market was saturated
  E.fulfillContract(c.cid);
  ok("fulfilling pays the reward", E.state.credits === crBefore + c.reward);
  ok("fulfilling consumes the goods", Math.abs(E.state.items[c.item] - 5) < 1e-6);
  ok("fulfilling cools that item's market (demand reset)", E.demandSat[c.item] === 0);
  // v0.42.0: fulfilling starts a buyer cooldown — the slot refills only after it passes (no spam-chaining)
  ok("fulfilling leaves the slot on cooldown", E.state.contracts.length === nBefore - 1 && !E.state.contracts.some(x => x.cid === c.cid));
  ok("fulfilling sets the cooldown timer", (E.state.contractNext||0) > Date.now());
  E.state.contractNext = 0; E.refillContracts();
  ok("slot refills once the cooldown passes", E.state.contracts.length === E.CONTRACT_SLOTS);

  // skip rerolls a contract (removes it; refill waits for the cooldown too)
  const sc = E.state.contracts[0];
  E.skipContract(sc.cid);
  ok("skip removes the contract and starts the cooldown", !E.state.contracts.some(x => x.cid === sc.cid) && E.state.contracts.length === E.CONTRACT_SLOTS - 1);
  E.state.contractNext = 0; E.refillContracts();
  ok("skipped slot refills after the cooldown", E.state.contracts.length === E.CONTRACT_SLOTS);

  // contracts survive a save/load
  const saved = E.defaultState(); saved.markets = 1; saved.contracts = [{ cid: 7, item: "gear", qty: 50, reward: 999 }];
  const loaded = E.migrate(JSON.parse(JSON.stringify(saved)));
  ok("contracts persist through migrate", Array.isArray(loaded.contracts) && loaded.contracts.length === 1 && loaded.contracts[0].reward === 999);
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
  // Ages I–II are free; III+ are gated behind total Blueprints earned (v0.42.0: an early gate teaches the Restructure loop).
  ok("Ages I–II are ungated", E.AGE_REQ[1] === 0 && E.AGE_REQ[2] === 0);
  ok("Ages III+ require increasing Blueprints", E.AGE_REQ[3] > 0 && E.AGE_REQ[4] > E.AGE_REQ[3] && E.AGE_REQ[5] > E.AGE_REQ[4] && E.AGE_REQ[6] > E.AGE_REQ[5]);

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

// ---------------------------------------------------------------- Age I signature: Prospecting (v0.44.0 depth engine)
(() => {
  fresh();
  ok("no vein by default → veinBonus is 0", E.veinBonus() === 0);
  ok("four vein tiers, ascending depth thresholds", E.VEIN_TIERS.length === 4 &&
    E.VEIN_TIERS.every((t, i) => i === 0 || t.min > E.VEIN_TIERS[i-1].min));

  // depth sets the tier
  eq("depth 0 → Surface Seam (tier 0)", E.veinTierAt(0), 0);
  eq("depth 90 → Mother Lode (tier 3)", E.veinTierAt(90), 3);

  // enough manual clicks fill the meter and strike a vein — starting a GLOBAL production surge
  fresh();
  let struck = false;
  for (let i = 0; i < 40 && !struck; i++) { E.mine(); if (E.state.veinLeft > 0) struck = true; }
  ok("manual mining eventually strikes a vein", struck && E.state.prospect === 0);
  ok("a vein surges GLOBAL production (not just raw)", E.veinBonus() > 0);
  const gr0 = E.globalRate();
  E.state.veinLeft = 0;
  ok("globalRate drops when the vein ends", E.globalRate() < gr0);

  // active mining drives DEPTH up toward the higher tiers
  fresh();
  for (let i = 0; i < 60; i++) E.mine();
  ok("sustained mining raises depth", E.state.depth > E.DEPTH_PER_STRIKE);

  // the surge multiplies ALL tiers now (via globalRate), unlike the old raw-only bonus
  fresh();
  E.state.veinTier = 1; E.state.veinLeft = 10;   // Rich Vein active
  E.state.machines.ironFurnace = 10; E.state.items.ironOre = 1000; E.state.items.coal = 1000;
  E.simulate(1, 1);
  ok("vein lifts non-raw output too (global surge)", E.state.items.ironPlate > 11);
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

  // With the highest threshold met, no age is shown as locked.
  fresh(); E.state.stats.bpEarned = Math.max(...E.AGE_REQ); E.state.stats.dmEarned = Math.max(...E.AGE_DM);   // everything unlocked (BP + DM gates)
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

// ---------------------------------------------------------------- Age III: accumulators boost production
(() => {
  fresh();
  ok("no charge → no accumulator bonus", E.accBonus() === 0);

  E.state.charge = 6400;                                  // ~80 accumulators' worth, full
  const b = E.accBonus();
  ok("banked energy grants a √-scaling production bonus", Math.abs(b - E.ACC_BOOST * Math.sqrt(6400)) < 1e-9 && b > 0.3);
  ok("accumulator bonus feeds globalRate", Math.abs(E.globalRate() - (1 + b)) < 1e-9);

  // the bonus is earned via power surplus: computePower banks surplus into the charge
  fresh();
  E.state.accumulators = 5; E.state.machines.miner = 1;   // ~1 MW demand vs 200 MW base grid → big surplus
  E.computePower(10);
  ok("accumulators bank surplus power (up to capacity)", E.state.charge > 0 && E.state.charge <= 5 * E.ACCUMULATOR.cap + 1e-6);
})();

// ---------------------------------------------------------------- Age VII: Interstellar chain (cosmic expansion)
(() => {
  // Age VII machines gate behind AGE_REQ[7]; Star Scoop (tier 0) is the ungated prereq.
  fresh();
  E.state.stats.bpEarned = 0; E.state.machines.starScoop = 1; E.refreshUnlocks(true);
  ok("Antimatter Reactor locked below its Blueprint gate", !E.state.unlocked.antimatterReactor);
  E.state.stats.bpEarned = E.AGE_REQ[7]; E.refreshUnlocks(true);
  ok("Age VII unlocks at its Blueprint gate", !!E.state.unlocked.antimatterReactor);

  // The full Interstellar chain produces end-to-end.
  fresh();
  E.state.unlocked.starScoop = true; E.state.machines.starScoop = 5; E.simulate(1, 1);
  ok("Star Scoop extracts hydrogen", E.state.items.hydrogen > 4.9);

  fresh();
  E.state.unlocked.antimatterReactor = true; E.state.machines.antimatterReactor = 3;
  E.state.items.hydrogen = 1000; E.state.items.processor = 1000; E.simulate(1, 1);
  ok("Antimatter Reactor makes antimatter", E.state.items.antimatter > 2.9);

  fresh();
  E.state.unlocked.dysonFoundry = true; E.state.machines.dysonFoundry = 2;
  E.state.items.antimatter = 1000; E.state.items.steel = 1000; E.state.items.circuit = 1000; E.simulate(1, 1);
  ok("Dyson Foundry assembles Dyson Panels", E.state.items.dysonPanel > 1.9);

  // currentAge reaches VII, and the age goal targets Dyson Panels.
  fresh(); E.state.machines.dysonFoundry = 1;
  ok("building a tier-7 machine advances to Age VII", E.currentAge() === 7);
  ok("Age VII goal is Dyson Panels", E.AGE_GOALS[7].item === "dysonPanel");
})();

// ---------------------------------------------------------------- Age VII signature: Dyson Swarm (grid power)
(() => {
  fresh();
  ok("no swarm on a fresh run", (E.state.dysonSwarm || 0) === 0 && E.dysonPower() === 0);
  E.state.items.dysonPanel = 10;
  E.deployDyson(4);
  eq("deploying consumes panels into the swarm (panels)", Math.floor(E.state.items.dysonPanel), 6);
  eq("deploying consumes panels into the swarm (swarm)", E.state.dysonSwarm, 4);
  ok("swarm feeds the grid, scaled by generator tech", E.dysonPower() === 4 * E.DYSON_MW * E.genMult());
  // that free power actually lands in computePower's supply
  fresh(); E.state.dysonSwarm = 3; E.recomputeStats(); E.computePower(1);
  ok("Dyson power lands in the grid's free supply", E.lastPower.free >= 3 * E.DYSON_MW - 1e-6);
  // can't deploy panels you don't have
  fresh(); E.state.items.dysonPanel = 2; E.deployDyson(10);
  ok("can't deploy more panels than you own", E.state.dysonSwarm === 2 && (E.state.items.dysonPanel || 0) < 1e-9);
  // the swarm is per-run (resets on Restructure, like the other signatures)
  fresh(); E.state.dysonSwarm = 50; E.freshRun(E.state);
  eq("swarm resets on a fresh run (per-run signature)", E.state.dysonSwarm || 0, 0);
})();

// ---------------------------------------------------------------- Age VIII: Transcendence chain (compute matter)
(() => {
  // Age VIII machines gate behind AGE_REQ[8] AND AGE_DM[8] (Dark Matter); Quantum Fab needs the Age VII prereq too.
  fresh();
  E.state.stats.bpEarned = E.AGE_REQ[7]; E.state.machines.dysonFoundry = 1; E.refreshUnlocks(true);
  ok("Quantum Fab locked below its Blueprint gate", !E.state.unlocked.quantumFab);
  E.state.stats.bpEarned = E.AGE_REQ[8]; E.refreshUnlocks(true);   // BP satisfied but not Dark Matter
  ok("Age VIII still locked without Dark Matter", !E.state.unlocked.quantumFab);
  E.state.stats.dmEarned = E.AGE_DM[8]; E.refreshUnlocks(true);   // now both gates satisfied
  ok("Age VIII unlocks once both Blueprint AND Dark-Matter gates are met", !!E.state.unlocked.quantumFab);
  ok("Age VIII gate is the steepest", E.AGE_REQ[8] > E.AGE_REQ[7]);
  ok("only Age VIII is Dark-Matter gated", E.AGE_DM[8] > 0 && E.AGE_DM.slice(0, 8).every(x => x === 0));

  // The full Transcendence chain produces end-to-end: Dyson Panel -> Qubit -> Simulated Matter -> Reality Shard.
  fresh();
  E.state.unlocked.quantumFab = true; E.state.machines.quantumFab = 3;
  E.state.items.dysonPanel = 1000; E.state.items.processor = 1000; E.simulate(1, 1);
  ok("Quantum Fab spins Qubits", E.state.items.qubit > 2.9);

  fresh();
  E.state.unlocked.matrioshka = true; E.state.machines.matrioshka = 2;
  E.state.items.qubit = 1000; E.state.items.antimatter = 1000; E.simulate(1, 1);
  ok("Matrioshka Node folds Simulated Matter", E.state.items.simMatter > 1.9);

  fresh();
  E.state.unlocked.realityCompiler = true; E.state.machines.realityCompiler = 2;
  E.state.items.simMatter = 1000; E.state.items.aiCore = 1000; E.simulate(1, 1);
  ok("Reality Compiler forges Reality Shards", E.state.items.realityShard > 1.9);

  // currentAge reaches VIII, and the age goal targets Reality Shards.
  fresh(); E.state.machines.realityCompiler = 1;
  ok("building a tier-8 machine advances to Age VIII", E.currentAge() === 8);
  ok("Age VIII goal is Reality Shards", E.AGE_GOALS[8].item === "realityShard");
})();

// ---------------------------------------------------------------- Age VIII signature: Reality Forking
(() => {
  fresh();
  ok("no forks on a fresh run", (E.state.forks || 0) === 0);
  near("forkMult is ×1 with no forks", E.forkMult(), 1);
  ok("no fork power draw with no forks", E.forkDraw() === 0);
  eq("first fork costs FORK_SHARD×1", E.forkCost(), E.FORK_SHARD);

  // opening a fork consumes the escalating shard cost and multiplies ALL production
  fresh();
  E.state.items.realityShard = 100;
  const c1 = E.forkCost();
  E.openFork();
  eq("opening a fork increments the fork count", E.state.forks, 1);
  near("first fork consumed its shard cost", E.state.items.realityShard, 100 - c1);
  near("one fork gives ×(1+FORK_GAIN) production", E.forkMult(), 1 + E.FORK_GAIN);
  ok("second fork costs more than the first", E.forkCost() > c1);

  // forkMult is an OUTER multiplier folded into globalRate
  fresh();
  const base = E.globalRate();
  E.state.forks = 3;
  near("globalRate multiplies by forkMult", E.globalRate(), base * (1 + 3 * E.FORK_GAIN));

  // the k-th fork's power draw escalates (triangular total)
  fresh();
  E.state.forks = 4;
  near("fork power draw is triangular (FORK_MW × f(f+1)/2)", E.forkDraw(), E.FORK_MW * (4 * 5 / 2));
  // ...and that draw lands in the grid demand → over-forking browns out
  fresh(); E.state.forks = 20; E.recomputeStats(); E.computePower(1);
  ok("unfed forks brown out the whole grid", E.lastPower.ratio < 1 && E.lastPower.demand >= E.forkDraw());

  // can't open a fork you can't afford
  fresh(); E.state.items.realityShard = 0; E.openFork();
  ok("can't fork without enough Reality Shards", (E.state.forks || 0) === 0);

  // collapse frees power but does NOT refund shards
  fresh(); E.state.items.realityShard = 100; E.openFork(); E.openFork();
  const heldAfterOpen = E.state.items.realityShard;
  E.collapseForks(99);
  ok("collapse closes every fork", (E.state.forks || 0) === 0);
  near("collapse does not refund spent shards", E.state.items.realityShard, heldAfterOpen);

  // forks are per-run (reset on Restructure/freshRun, like the other structural signatures)
  fresh(); E.state.forks = 7; E.freshRun(E.state);
  eq("forks reset on a fresh run (per-run signature)", E.state.forks || 0, 0);
})();

// ---------------------------------------------------------------- Ascension (4th prestige = META-AUTOMATION)
(() => {
  fresh();
  ok("ascension locked before the Interstellar Age", !E.ascensionUnlocked());
  E.state.maxAge = E.ASCEND_UNLOCK_AGE;
  ok("ascension unlocks at the Interstellar Age", E.ascensionUnlocked());

  // Dark Matter gain scales with Blueprints earned this era (√)
  fresh();
  ok("no Dark Matter with no Blueprints", E.darkMatterAvailable() === 0);
  E.state.stats.bpEarned = E.ASCEND_SCALE * 9;                      // √9 = 3
  ok("Dark Matter = floor(√(bpEarned / ASCEND_SCALE))", E.darkMatterAvailable() === 3);

  // Dark Matter buys OPTIONAL AUTOMATION — activating one sets its flag, costs DM, respects max
  fresh();
  E.state.darkMatter = 30;
  E.upgradeDM("autoRes");
  ok("activating an automation spends Dark Matter", E.state.darkMatter === 30 - E.dmCost(E.DM_AUTO.find(x=>x.id==="autoRes"), 0));
  ok("automation flag is set", E.dmHas("autoRes") === true);
  const dmMid = E.state.darkMatter; E.upgradeDM("autoRes");
  ok("a maxed (max:1) automation can't be bought again", E.state.darkMatter === dmMid && (E.state.dmUpg.autoRes||0) === 1);
  ok("an automation alone adds no stat multipliers", Math.abs(E.globalRate() - 1) < 1e-9);

  // ...but Dark Matter's PERMANENT POWER upgrades DO feed the stat cache (v0.45.0 — the layer's main draw)
  fresh(); E.state.dmUpg = { darkStar: 5 }; E.recomputeStats();
  near("Dark Star adds +8% production per level", E.globalRate(), 1.4);
  fresh(); E.state.dmUpg = { voidMarket: 2 }; E.recomputeStats();
  near("Void Market adds +15% sale value per level", E.marketMult(), 1.3);
  fresh(); E.state.maxAge = 4; E.recomputeStats(); const gridNoCG = E.gridBase();
  fresh(); E.state.maxAge = 4; E.state.dmUpg = { cosmicGrid: 3 }; E.recomputeStats();
  ok("Cosmic Grid adds free grid per age", E.gridBase() === gridNoCG + 6 * 3 * 4);

  // Blueprint Autopilot allocates Blueprints into the tree automatically
  fresh();
  E.state.blueprints = 200; E.state.allocated = { start: true };
  E.autoAllocateBP();
  ok("Blueprint Autopilot allocates nodes", Object.keys(E.state.allocated).length > 1 && E.state.blueprints < 200);

  // Talent Autopilot spends Talent Points automatically
  fresh();
  E.state.talentPoints = 100;
  E.autoBuyTalents();
  ok("Talent Autopilot spends Talent Points", E.state.talentPoints < 100 && Object.keys(E.state.talents).length > 0);

  // metaAuto runs the loops: with Auto-Restructure active + a run worth prestiging, it prestiges
  fresh();
  E.state.maxAge = 7; E.state.dmUpg = { autoRes: 1 }; E.state.runCredits = 1e7; E.state.lastBpGain = 0;
  const pres0 = E.state.prestiges;
  E.metaAuto();
  ok("Auto-Restructure prestiges automatically when worth it", E.state.prestiges > pres0);

  // automations can be PAUSED (dmOff) so you can respec without the autopilot re-allocating
  fresh();
  E.state.dmUpg = { bpAuto: 1 };
  ok("owned automation is active by default", E.dmActive("bpAuto") === true);
  E.state.dmOff = { bpAuto: true };
  ok("paused automation is not active", E.dmActive("bpAuto") === false && E.dmHas("bpAuto") === true);
  // metaAuto skips a paused Blueprint Autopilot → a respec's Blueprints stay unallocated
  E.state.blueprints = 200; E.state.allocated = { start: true };
  E.metaAuto();
  ok("paused Blueprint Autopilot does NOT re-allocate", Object.keys(E.state.allocated).length === 1 && E.state.blueprints === 200);
  // resuming re-activates it
  E.state.dmOff = {};
  E.metaAuto();
  ok("resumed Blueprint Autopilot allocates again", Object.keys(E.state.allocated).length > 1);
  // dmOff persists through migrate
  const savedOff = E.defaultState(); savedOff.dmUpg = { bpAuto: 1 }; savedOff.dmOff = { bpAuto: true };
  const loadedOff = E.migrate(JSON.parse(JSON.stringify(savedOff)));
  ok("paused state persists through migrate", loadedOff.dmOff && loadedOff.dmOff.bpAuto === true);

  // ---- v0.41.0: Paradox Engine, rush orders, completion, notation, tree paths ----
  // Paradox Engine multiplies the Ascendant Foundation head-start (the endless DM sink)
  { const base = E.defaultState(); base.stats.dmEarned = 36; E.freshRun(base);
    const boosted = E.defaultState(); boosted.stats.dmEarned = 36; boosted.dmUpg = { paradox: 4 }; E.freshRun(boosted);
    ok("Paradox Engine grows the Foundation head-start", (boosted.machines.miner || 0) > (base.machines.miner || 0) && boosted.credits > base.credits);
    const pausedP = E.defaultState(); pausedP.stats.dmEarned = 36; pausedP.dmUpg = { paradox: 4 }; pausedP.dmOff = { paradox: true }; E.freshRun(pausedP);
    ok("a paused Paradox Engine does nothing", (pausedP.machines.miner || 0) === (base.machines.miner || 0));
    ok("Paradox Engine is effectively unbounded", E.DM_AUTO.find(u => u.id === "paradox").max >= 99); }

  // Rush orders: an expired rush contract is dropped (and the board refills); live ones survive
  fresh(); E.state.markets = 1;
  E.state.contracts = [{ cid: 950, item: "ironOre", qty: 50, reward: 500, exp: Date.now() - 1000 }];
  E.refillContracts();
  ok("expired rush contracts are dropped and rerolled", !E.state.contracts.some(c => c.cid === 950) && E.state.contracts.length === E.CONTRACT_SLOTS);
  fresh(); E.state.markets = 1;
  E.state.contracts = [{ cid: 951, item: "ironOre", qty: 50, reward: 500, exp: Date.now() + 60000 }];
  E.refillContracts();
  ok("live rush contracts survive the refill sweep", E.state.contracts.some(c => c.cid === 951));

  // Completion: mastering the FINAL age latches completedAt exactly once
  fresh();
  E.state.stats.made = { realityShard: E.AGE_GOALS[8].n };
  E.checkAgeGoals();
  ok("mastering the final age fires completion", !!E.state.ageGoals[8] && E.state.completedAt > 0);
  { const t1 = E.state.completedAt; E.checkAgeGoals();
    ok("completion only fires once", E.state.completedAt === t1); }

  // Scientific notation option
  fresh();
  { const compact = E.fmt(2.5e9);
    E.state.notation = "sci";
    eq("scientific notation formats big numbers", E.fmt(2.5e9), "2.50e9");
    ok("small numbers stay plain in sci mode", E.fmt(950) === "950");
    E.state.notation = "compact";
    eq("compact notation restored", E.fmt(2.5e9), compact); }

  // migrate defaults for the new fields
  { const old = E.defaultState(); delete old.completedAt; delete old.notation; delete old.stats.playSec;
    const mig = E.migrate(JSON.parse(JSON.stringify(old)));
    ok("migrate defaults completion/notation/playtime", mig.completedAt === 0 && mig.notation === "compact" && mig.stats.playSec === 0); }

  // Tree path preview: cheapest path from the Core to a ring-2 node is the two spine nodes
  fresh();
  { const res = E.cheapestPathTo("ind_2");
    ok("cheapestPathTo finds the spine path", !!res && res.path.length === 2 && res.path[1] === "ind_2" && res.from === "start");
    ok("path cost sums the unallocated node costs", res.cost === E.NODES["ind_1"].cost + E.NODES["ind_2"].cost);
    E.state.allocated.ind_1 = true;
    const res2 = E.cheapestPathTo("ind_2");
    ok("allocated nodes are free in the path", res2.cost === E.NODES["ind_2"].cost && res2.from === "ind_1"); }

  // persists through a save/load
  const saved = E.defaultState(); saved.darkMatter = 5; saved.dmUpg = { autoRes: 1, headStart: 2 }; saved.ascensions = 3;
  const loaded = E.migrate(JSON.parse(JSON.stringify(saved)));
  ok("ascension state persists through migrate", loaded.darkMatter === 5 && loaded.dmUpg.autoRes === 1 && loaded.dmUpg.headStart === 2 && loaded.ascensions === 3);
})();

// ---------------------------------------------------------------- DM PROGRESSION SPINE: lifetime Dark Matter drives the ceiling
(() => {
  // ascend() accrues LIFETIME dmEarned (never spent) separately from the spendable darkMatter balance
  fresh();
  E.state.maxAge = 7;
  E.ascend(4);
  ok("ascend banks spendable Dark Matter", E.state.darkMatter === 4);
  ok("ascend accrues lifetime dmEarned", E.state.stats.dmEarned === 4);
  E.upgradeDM("darkStar"); // spend some darkMatter (cost 3)
  ok("spending Dark Matter does NOT reduce lifetime dmEarned (gate stays cleared)", E.state.stats.dmEarned === 4 && E.state.darkMatter < 4);

  // dmEarned is the Age-VIII gate — spending the balance can't re-lock the age
  fresh();
  E.state.stats.bpEarned = E.AGE_REQ[8];
  E.state.stats.dmEarned = E.AGE_DM[8]; E.state.darkMatter = 0;   // earned the gate, then spent every DM
  E.state.machines.dysonFoundry = 1; E.refreshUnlocks(true);
  ok("Age VIII stays unlocked on lifetime dmEarned even with 0 spendable Dark Matter", !!E.state.unlocked.quantumFab);

  // migrate defaults dmEarned for old saves (no dmEarned field)
  const old = E.defaultState(); delete old.stats.dmEarned;
  const mig = E.migrate(JSON.parse(JSON.stringify(old)));
  ok("migrate defaults dmEarned for legacy saves", mig.stats.dmEarned === 0);

  // Ascendant Foundation: freshRun seeds a PYRAMID head-start that grows with dmEarned (cross-era progression engine)
  fresh();
  const noSeed = E.defaultState(); E.freshRun(noSeed);
  const baseMiners = noSeed.machines.miner || 0;
  E.state.stats.dmEarned = 36; E.freshRun(E.state);
  ok("accumulated Dark Matter pre-builds a head-start factory", (E.state.machines.miner || 0) > baseMiners + 10);
  // pyramid shape: strictly more of the lower tiers than the higher seeded tiers
  ok("head-start is a balanced pyramid (more low-tier than high-tier machines)",
     (E.state.machines.miner || 0) > (E.state.machines.assembler || 0) && (E.state.machines.assembler || 0) > 0);
  // and it grows with dmEarned (more DM → bigger head-start)
  const s10 = E.defaultState(); s10.stats.dmEarned = 10; E.freshRun(s10);
  const s40 = E.defaultState(); s40.stats.dmEarned = 40; E.freshRun(s40);
  ok("bigger lifetime Dark Matter → bigger head-start", (s40.machines.miner || 0) > (s10.machines.miner || 0));
})();

// ---------------------------------------------------------------- richer tree nodes (synergy + mechanic-changers)
(() => {
  const nodeByName = n => Object.keys(E.NODES).find(i => E.NODES[i].name === n);

  // SYNERGY: "Economies of Scale" scales production with machine count
  fresh();
  E.state.allocated[nodeByName("Economies of Scale")] = true;   // +2% prod / 100 machines
  E.state.machines.miner = 500; E.recomputeStats();
  ok("prodPerMachine synergy scales with machine count", Math.abs(E.globalRate() - (1 + 0.02 * 5)) < 0.01);

  // SYNERGY: "Ancestral Knowledge" scales production with age reached
  fresh();
  E.state.allocated[nodeByName("Ancestral Knowledge")] = true;  // +5% prod / age
  E.state.maxAge = 6; E.recomputeStats();
  ok("prodPerAge synergy scales with age (× above the age dividend)", E.globalRate() > 1 + 0.05 * 6);

  // MECHANIC: "Frictionless Chains" (noBackpressure) — a full-output machine still consumes inputs (no stall)
  fresh();
  E.state.machines.ironFurnace = 5; E.state.items.ironOre = 1000; E.state.items.coal = 1000;
  E.state.items.ironPlate = E.capOf("ironPlate");               // output full → normally throttles to 0
  E.simulate(1, 1);
  ok("without noBackpressure, full output stalls the machine", Math.abs(E.state.items.ironOre - 1000) < 1e-6);
  fresh();
  E.state.allocated[nodeByName("Frictionless Chains")] = true; E.recomputeStats();
  E.state.machines.ironFurnace = 5; E.state.items.ironOre = 1000; E.state.items.coal = 1000;
  E.state.items.ironPlate = E.capOf("ironPlate");
  E.simulate(1, 1);
  ok("noBackpressure: full-output machine still consumes inputs (chain doesn't stall)", E.state.items.ironOre < 999);

  // MECHANIC: "Autonomous Mining" (rawFree) — raw extractors ignore the power throttle
  const oreUnder = (withRawFree) => {
    fresh();
    if (withRawFree) { E.state.allocated[nodeByName("Autonomous Mining")] = true; E.recomputeStats(); }
    E.state.machines.miner = 10;                                 // tier-0 raw
    E.state.unlocked.robotAssembler = true; E.state.machines.robotAssembler = 60;   // tier-5, huge draw → brownout
    E.state.items.robotArm = 1e4; E.state.items.processor = 1e4; E.state.items.mechanism = 1e4;
    E.state.items.ironOre = 0;
    E.simulate(1, 1);
    return E.state.items.ironOre;
  };
  const throttled = oreUnder(false), free = oreUnder(true);
  ok("without rawFree, miners are power-throttled", throttled < 9.9);
  ok("rawFree: raw extraction ignores the power throttle", free > throttled + 1);
})();

// ---------------------------------------------------------------- v0.42.0 qualitative tree pass (10 new specials)
(() => {
  const nodeByName = n => Object.keys(E.NODES).find(i => E.NODES[i].name === n);
  const alloc = n => { E.state.allocated[nodeByName(n)] = true; E.recomputeStats(); };
  ok("all 10 new specials exist in the tree",
    ["Cross-Docking","Deep Reserves","Flash Capacitors","Superconductors","Trade Contacts","Market Makers","Master Machinists","Geologist's Eye","Patent Attorneys","Event Horizon"]
      .every(n => !!nodeByName(n)));

  // Master Machinists: Mk multiplier steepens
  fresh(); E.state.mk.miner = 4;
  const mk0 = E.mkMult("miner"); alloc("Master Machinists");
  near("Master Machinists: Mk 4 gives ×3.6 (was ×3.0)", E.mkMult("miner"), 1 + 0.65*4, 1e-9);
  ok("Mk boost is an increase", E.mkMult("miner") > mk0);

  // Superconductors: grid grows with age
  fresh(); E.state.maxAge = 6; E.recomputeStats();
  const g0 = E.gridBase(); alloc("Superconductors");
  near("Superconductors: +4 MW per age", E.gridBase(), g0 + 4*6, 1e-9);

  // Patent Attorneys: patents cost less
  fresh();
  const p = E.PATENTS[0], c0 = E.patentCost(p, 2); alloc("Patent Attorneys");
  ok("Patent Attorneys: 25% cheaper patents", E.patentCost(p, 2) === Math.max(1, Math.round(p.base*3*0.75)) && E.patentCost(p, 2) < c0);

  // Event Horizon: bonus Dark Matter on Ascension
  fresh(); E.state.maxAge = 7; alloc("Event Horizon");
  E.ascend(4);
  eq("Event Horizon: +1 🌑 per Ascension", E.state.darkMatter, 5);

  // Trade Contacts: contract payouts +40%
  fresh(); E.state.markets = 1; alloc("Trade Contacts");
  E.state.contracts = [{cid: 970, item: "ironOre", qty: 10, reward: 100}];
  E.state.items.ironOre = 20; const cr0 = E.state.credits;
  E.fulfillContract(970);
  eq("Trade Contacts: fulfil pays 140", Math.round(E.state.credits - cr0), 140);

  // Market Makers: demand recovers twice as fast
  fresh(); E.state.machines.miner = 1;
  E.demandSat.gear = 0.8; E.simulate(1, 1); const slow = E.demandSat.gear;
  fresh(); E.state.machines.miner = 1; alloc("Market Makers");
  E.demandSat.gear = 0.8; E.simulate(1, 1);
  ok("Market Makers: saturation decays faster", E.demandSat.gear < slow);

  // Cross-Docking: terminal throughput +75%
  fresh(); E.state.markets = 1; E.state.marketItem = "ironOre"; E.state.items.ironOre = 100;
  E.simulate(1, 1); const soldBase = 100 - E.state.items.ironOre;
  fresh(); alloc("Cross-Docking"); E.state.markets = 1; E.state.marketItem = "ironOre"; E.state.items.ironOre = 100;
  E.simulate(1, 1);
  near("Cross-Docking: sells 1.75× per tick", (100 - E.state.items.ironOre) / soldBase, 1.75, 0.01);

  // Deep Reserves: overstock keep-line drops to 70%
  fresh(); alloc("Deep Reserves"); E.state.markets = 40; E.state.marketItem = E.MARKET_OVERSTOCK;
  E.state.items.ironOre = E.capOf("ironOre") * 0.8;   // above 70%, below 90% — only sells with Deep Reserves
  E.simulate(1, 1);
  ok("Deep Reserves: overstock sells between 70% and 90% of cap", E.state.items.ironOre < E.capOf("ironOre") * 0.8 - 1e-6);

  // Flash Capacitors: accumulators bank surplus twice as fast
  const bank = (withNode) => { fresh(); if (withNode) alloc("Flash Capacitors");
    E.state.accumulators = 50; E.state.charge = 0; E.state.machines.miner = 1;   // huge surplus vs 1 MW draw
    E.computePower(1); return E.state.charge; };
  const c1 = bank(false), c2 = bank(true);
  near("Flash Capacitors: ×2 charging", c2 / c1, 2, 0.01);

  // Geologist's Eye: veins last twice as long
  fresh();
  E.state.depth = 0; E.strikeVein(true); const base = E.state.veinLeft;
  fresh(); alloc("Geologist's Eye");
  E.state.depth = 0; E.strikeVein(true);
  near("Geologist's Eye: vein duration doubled", E.state.veinLeft, base*2, 1);

  // Contract scaling: quantities track production rate at scale
  fresh(); E.prodRate.ironOre = 500;   // simulate late-game output
  E.demandSat.ironOre = 0;
  ok("demand depth grows with production", E.demandDepth("ironOre") > E.ITEMS.ironOre.cap * E.DEMAND_DEPTH_K + 1000);
  E.prodRate.ironOre = 0;
})();

// ---------------------------------------------------------------- summary
console.log(`\n${fail === 0 ? "✓ ALL PASSED" : "✗ FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
