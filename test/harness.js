// Headless test harness for COGWORKS.
// Loads the real <script> from index.html into a Node VM with a stub DOM, so tests run the
// ACTUAL game logic (no duplicated code, no changes to index.html).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// A universal fake DOM node that absorbs any property access / method call without throwing,
// so the handful of top-level DOM statements in the game script run harmlessly.
const fake = new Proxy(function () {}, {
  get(_t, p) {
    if (p === "children") return [];
    if (p === "length") return 0;
    if (p === "style") return {};
    if (p === "dataset") return {};
    if (p === "classList") return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    if (p === Symbol.iterator) return [][Symbol.iterator].bind([]);
    return fake;
  },
  set() { return true; },
  apply() { return fake; },
});

// The list of engine identifiers exposed to tests. They exist in index.html's top script scope.
const EXPORTS = [
  "VERSION", "PRESTIGE_SCALE", "TP_SCALE", "BASE_GRID", "DRAW",
  "ITEMS", "MACHINES", "MORDER", "GENERATORS", "GORDER", "WAREHOUSE", "MARKET", "MARKET_OVERSTOCK", "OVERSTOCK_KEEP",
  "VALUE_MARKUP", "deriveSellValues",
  "DEMAND_FLOOR", "DEMAND_DEPTH_K", "DEMAND_REGEN", "demandDepth", "demandFactor", "unitPrice", "sellValue", "demandSat",
  "CONTRACT_SLOTS", "CONTRACT_PREMIUM", "CONTRACT_QTY", "genContract", "refillContracts", "fulfillContract", "skipContract", "contractsUnlocked",
  "START_MACHINES", "START_ITEMS", "NODES", "EDGES", "MILESTONES", "TALENTS", "TIER_REQ",
  "defaultState", "freshRun", "migrate",
  "recomputeStats", "st",
  "globalRate", "inputEff", "rawEff", "capMult", "marketMult", "buildDiscount", "mkDiscount",
  "offlineEff", "offlineCap", "orePerClick", "capOf", "mkMult", "bpFor", "genMult", "gridBase",
  "fuelMult", "demandMult",
  "planBuild", "scaleBOM", "buildBOM", "planMachine", "planGenerator", "planWarehouse", "planMarket",
  "mkCredits", "mkBOM", "marketMkCredits", "marketMkBOM", "canAfford", "pay",
  "machineUnlocked", "refreshUnlocks", "itemUnlocked", "genUnlocked", "AGE_REQ", "AGE_DM", "ageUnlocked", "AGE_SIG", "ageRoadmap",
  "simulate", "computePower", "addCredits",
  "checkMilestones", "grantTP", "earnedTP",
  "talentCost", "talentSpent", "tierUnlocked",
  "PATENTS", "PATENT_UNLOCK", "PATENT_SCALE", "patentCost", "patentAvailable", "patentsUnlocked",
  "DM_AUTO", "ASCEND_SCALE", "ASCEND_UNLOCK_AGE", "dmCost", "dmHas", "darkMatterAvailable", "ascensionUnlocked", "upgradeDM",
  "restructure", "filePatent", "ascend", "metaAuto", "autoAllocateBP", "autoBuyTalents",
  "AGES", "TIER_AGE", "TIER_MULT", "ROMAN", "currentAge", "workforceBonus", "deployRobots", "recallRobots",
  "WORKFORCE_MW", "workforceDraw",
  "DYSON_MW", "dysonPower", "deployDyson",
  "FORK_GAIN", "FORK_MW", "FORK_SHARD", "forkMult", "forkDraw", "forkCost", "openFork", "collapseForks",
  "PROSPECT_MAX", "VEIN_DUR", "VEIN_BONUS", "prospectMult", "mine",
  "OC_SPEED", "OC_INPUT", "overclockOn", "ocSpeed", "ocInput",
  "FLEET_CAP_MULT", "FLEET_REPLICATE", "FLEET_MULT", "fleetCap", "fleetBonus", "launchProbes",
  "ACCUMULATOR", "ACC_BOOST", "accBonus", "planAccumulator", "autoBuild", "AGE_GOALS", "checkAgeGoals", "SND", "bottleneck", "chainHealth",
  "potMade",
];

function loadEngine() {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Could not find <script> in index.html");
  let code = m[1];
  code = code.replace(/\bboot\(\);\s*$/, ""); // don't run the browser boot sequence
  code += `\n;globalThis.__E = { ${EXPORTS.join(", ")}, get state(){return state}, set state(v){state=v}, get lastPower(){return lastPower} };`;

  const sandbox = {
    document: { getElementById: () => fake, querySelectorAll: () => [], createElement: () => fake, addEventListener() {}, body: fake },
    window: { addEventListener() {}, location: { reload() {} } },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    setInterval() {}, clearInterval() {}, setTimeout() {}, clearTimeout() {},
    console, btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "cogworks-engine" });
  return sandbox.__E;
}

module.exports = { loadEngine };
