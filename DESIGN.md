# COGWORKS — Design Document

*An idle factory game for the browser. Single-file, no dependencies, runs from `file://`.*

Version: 0.3.0 · Status: playable prototype

---

## 1. Concept

You run an automated factory. Raw materials are extracted, refined, and combined up a
deep **crafting tree** — and crucially, **machines themselves are built from the
components you craft**. A Gear Press needs Iron Plates; a Circuit Fab needs Copper Wire
and Gears; a Robotics Lab needs Mechanisms, Processors, and Steel. So progress isn't a
single line — it's a *web*: to unlock the next machine you must first stand up the
supply lines that feed its bill-of-materials.

Three pressures keep you busy:
1. **Ratios** — every machine consumes upstream output, so you constantly rebalance.
2. **Storage** — buffers are capped; a full buffer *throttles* everything upstream
   (backpressure), so you expand Warehouses to keep the line flowing.
3. **The bill-of-materials** — building or upgrading machines drains your components,
   so expansion competes with production for the same parts.

When growth stalls, **Restructure** (prestige): wipe the factory for permanent
**Blueprints** spent in a Research tree.

The journey is framed as six **Ages** (Stone & Iron → Machine → Industrial → Automation →
Robotic → Space) — see the **Ages** section. Reaching a new Age for the first time is a
celebrated milestone with a permanent reward, and after a Restructure you re-climb the
Ages — faster each run.

---

## 2. Design pillars

1. **The tree *is* the game.** ~19 resources across 6 tiers and 20 machines, each gated
   behind the machines that supply its parts. Unlocks are a guided tech path, revealed
   progressively so you're never shown the whole tree at once.
2. **Backpressure over waste.** Capped buffers throttle producers instead of silently
   wasting output. A choked Iron Plate buffer stalls the furnace, which backs up the
   miners — a legible signal to expand storage or add downstream capacity.
3. **Every upgrade costs the tree.** Mk upgrades and machine builds consume real
   components, so the crafting economy is the currency of growth — not just credits.
4. **Respect the player's time.** Offline progress, autosave, export/import from day one.

---

## 3. Resources (24, across 7 tiers)

Each has a **storage cap** (raised by Warehouses + Logistics research) and a **sell value**.

| Tier | Resources (sell value) |
|---|---|
| 0 · Extraction | Iron Ore ($1), Coal ($1), Copper Ore ($1), Stone ($0.8), Crude Oil ($2), Silicon Sand ($1.5) |
| 1 · Smelting & Refining | Iron Plate ($3), Copper Plate ($3), Brick ($2.5), Concrete ($7), Plastic ($6) |
| 2 · Basic Components | Gear ($10), Copper Wire ($5), Steel ($18), Alloy ($15) |
| 3 · Advanced Components | Circuit ($30), Silicon ($25), Electric Motor ($40) |
| 4 · Complex Assemblies | Mechanism ($90), Processor ($200) |
| 5 · Robotics | Robot Arm ($500), Robot ($2,500) |
| 6 · Singularity Tech | AI Core ($15,000), Von Neumann Probe ($150,000) |

Base caps shrink as tiers rise (raw 500 → Probe 25), so high-tier parts are precious
and expanding their storage is a real decision.

---

## 4. Machines (26)

All rates are per machine per second at Mk 0. `build` = one-time cost to construct one:
a **credit** cost that scales per machine owned by `TIER_MULT[tier]` — **steepening with tier**
(1.15 raw → 1.19 components → 1.30 complex → **1.55 Singularity**), so high-tier machines get
exponentially expensive to stack. This is the core of the **prestige wall** (§9a): a single run
can't brute-force the endgame, because late costs outrun a run's bounded income. (A per-machine
`build.mult` can still override the tier default.) Plus a **flat component BOM** pulled from storage. `unlock` = machines you must have built for this to appear. Build in
**×1 / ×10 / Max** batches (a shared toggle covering machines, generators, warehouses,
and terminals); *Max* takes the smaller of the credit- and component-limits, so a button
never promises more than you can actually afford.

| Machine | Recipe (in → out) | Build cost | Unlocked by |
|---|---|---|---|
| **Miner** | → Iron Ore | $15 | *start* |
| **Coal Drill** | → Coal | $60 | *start* |
| **Iron Furnace** | 2 Ore + 1 Coal → Iron Plate | $120 | *start* |
| Copper Miner | → Copper Ore | $80 + 5 Plate | Iron Furnace |
| Quarry | → Stone | $150 + 8 Plate | Iron Furnace |
| Copper Furnace | 2 Cu Ore + 1 Coal → Cu Plate | $200 + 10 Plate | Iron Furnace |
| Kiln | 2 Stone + 1 Coal → Brick | $250 + 8 Plate | Iron Furnace |
| Cement Kiln | 2 Stone + 1 Coal → Concrete (sell) | $200 + 8 Plate | Iron Furnace |
| Gear Press | 2 Plate → Gear | $400 + 15 Plate | Iron Furnace |
| Wire Mill | 1 Cu Plate → 2 Cu Wire | $400 + 15 Cu Plate | Copper Furnace |
| Steel Mill | 3 Plate + 2 Coal → Steel | $1.2K + 20 Plate + 10 Gear | Gear Press |
| Alloy Furnace | 2 Plate + 1 Cu Plate → Alloy | $300 + 10 Plate | Copper Furnace |
| Foundry | 1 Alloy + 1 Coal → Steel | $1.5K + 20 Plate + 10 Alloy | Steel Mill + Alloy Furnace |
| Circuit Fab | 3 Cu Wire + 1 Plate → Circuit | $3K + 20 Cu Wire + 10 Gear | Wire Mill + Steel Mill |
| Motor Winder | 3 Cu Wire + 1 Steel → Electric Motor | $4K + 20 Cu Wire + 10 Steel | Circuit Fab |
| Assembler | 2 Gear + 1 Circuit → Mechanism | $8K + 20 Circuit + 20 Gear + 10 Steel | Circuit Fab |
| Gearworks | 1 Motor + 1 Gear → Mechanism | $12K + 15 Motor + 20 Gear + 10 Steel | Assembler + Motor Winder |
| Oil Pump | → Crude Oil | $5K + 10 Steel + 20 Gear | Assembler |
| Sand Extractor | → Silicon Sand | $4K + 8 Steel | Assembler |
| Refinery | 2 Oil → Plastic | $6K + 15 Steel + 10 Circuit | Assembler |
| Silicon Furnace | 2 Sand + 2 Coal → Silicon | $6K + 12 Steel + 20 Brick | Assembler |
| Chip Fab | 3 Circuit + 1 Silicon + 1 Plastic → Processor | $15K + 30 Circuit + 15 Silicon + 15 Plastic | Assembler |
| Robotics Lab | 2 Mechanism + 1 Processor + 1 Steel → Robot Arm | $40K + 20 Mech + 10 Proc + 30 Steel | Chip Fab |
| Robot Assembler | 1 Arm + 1 Processor + 1 Mechanism → Robot | $100K + 10 Arm + 10 Proc + 20 Mech | Robotics Lab |
| AI Foundry | 2 Processor + 1 Arm → AI Core | $400K + 30 Proc + 15 Arm + 50 Circuit | Robot Assembler |
| Probe Assembler | 1 AI Core + 1 Robot + 2 Steel → Probe | $2M + 15 AI Core + 15 Robot + 80 Steel | AI Foundry |

The unlock graph forms distinct **eras**: the Iron era, a Copper/Steel branch, the
Circuit gate, then the big **Assembler unlock** that opens the entire Oil + Silicon +
Chip branch at once, culminating in Robotics and finally the **Singularity Tech** tier
(AI Cores → Von Neumann Probes).

---

## 5. Machine tiers (Mk)

Each machine type has a global **Mk level**. Upgrading Mk L→L+1 costs credits
(`base×2 × 2^L`) plus a scaling amount of a themed component (`mkItem`: Gears for
extraction/smelting, Circuits for basic components, Steel/Mechanisms/Processors for
higher tiers). Each Mk level grants **+50% throughput** to *all* machines of that type
(Mk-additive: Mk 4 = ×3.0). Mk is uncapped — a long optimization route where later
levels demand advanced components, tying upgrades back into the crafting economy.

---

## 6. Storage & logistics

- Every resource has a cap = `baseCap × (1 + 0.25·warehouses) × (1 + 0.25·Logistics)`.
- **Warehouses** (credits + Bricks, scaling) raise the cap of *every* resource at once.
- **Backpressure:** a machine's throughput is clamped by both input availability *and*
  remaining output space. Full buffer → machine idles → upstream backs up. No silent
  waste; the bottleneck is always visible via the red "■ output full" / "⚠ starved"
  status on each machine and the red cap bar on each resource chip.

**Trade Terminal** — the sink: build one (credits + Plates + Gears) and either pick a
single resource to **auto-sell** for Credits, or choose **⚙️ Sell overstock (auto)** — a
pressure-relief mode that sells the surplus of *every* item above `OVERSTOCK_KEEP` (90%) of
its cap, fullest buffer first, within the terminal's throughput. Because it only shaves the
top slice (never below 90%), it relieves backpressure and monetises wasted overflow without
starving any downstream recipe. Higher Mk sells faster. Manual per-resource "$" sell buttons
remain for bootstrap.

---

## 7. Power (electricity)

A cross-cutting throttle. Every machine **draws power**; if supply can't meet demand, the
*entire* factory runs slower in proportion (`powerRatio = min(1, supply/demand)`).

- **Demand** = Σ `DRAW[tier] × count × Mk-multiplier` (× the `powerdraw` penalty), **plus**
  the Age-V **workforce upkeep** `deployed × 0.5 MW` (see §15). Draw by tier: Extraction/Smelting
  1 MW, Components 2, Advanced 3, Complex 5, Robotics 8, Singularity 12 — and it scales with Mk, so
  upgrading throughput also raises the power bill (power stays relevant late-game).
- **Base grid** supplies **200 MW free** — enough for the whole early/mid game, so power
  only starts to bite once you scale past ~200 machine-equivalents (around first-prestige
  scale). It also acts as a *floor* that prevents power death-spirals.
- **Generators:**

  | Generator | Output | Fuel | Build | Unlock |
  |---|---|---|---|---|
  | Steam Engine | 25 MW | 1 Coal/s | $500 + 20 Plate + 10 Gear | Gear Press |
  | Solar Panel | 20 MW | none | $8K + 20 Steel + 15 Circuit | Circuit Fab |
  | Fusion Reactor | 600 MW | none | $200K + 20 Proc + 10 Arm + 30 Steel | Robotics Lab |

- **The Coal tension:** Steam Engines burn **Coal — the same resource furnaces need for
  smelting**. Steam is dispatched *demand-aware* (it burns only enough Coal to cover the
  gap free sources don't), but leaning on it still forces you to grow Coal mining to feed
  both power *and* smelting. Solar/Fusion trade fuel for a steep component cost.
- **Self-healing floor:** if Coal runs out, steam output drops and the factory throttles —
  but the 20 MW base grid keeps Coal Drills running, so Coal rebuilds and power recovers.
  No hard power death-spiral.
- Surfaced in the header (`⚡ 87%`) and a dedicated **Power** tab with a load bar + warnings.

---

## 8. Advancement Tree (Blueprints — permanent)

The prestige "shop" and the **power/capability** meta layer — production multipliers,
capacity, economy, and unlocks. (Cost-reduction lives in the Talent Tree, §11, so the two
never overlap.) A large interconnected **passive tree** (~55 nodes) spent with Blueprints.
Pathing is **Path-of-Exile-style**: a node can be allocated only when an adjacent node is
already allocated, starting from the central **Core**. Allocations are kept across every
Restructure — and are fully refundable (see Respec below).

**Six themed arms** radiate from the Core, each ending in a **keystone**:

| Arm | Focus | Keystone |
|---|---|---|
| Industry | global production (+ **Blast Furnace**: +50% smelter output) | **Overdrive Core** — +120% production, *but +50% power demand* |
| Logistics | storage caps | **Infinite Shelving** — +200% caps |
| Power | grid + generator output | **Zero-Point Grid** — +150% gen, +250 MW grid |
| Commerce | sale value | **Monopoly** — +180% sale value |
| Engineering | production, click, automation | **Nanoforge** — +110% production |
| Ascendancy | Blueprints, offline, kickstart | **Singularity** — +150% BP, +50% offline, +50% production |

*(Node effects were roughly doubled in the punchy-meta pass so spending Blueprints visibly
accelerates each run; minors give ~8–16%, notables ~30–40%, keystones the above.)*

**Node tiers:** *minor* (small single-stat, 2–7 📐), *notable* (a named mid-arm bonus,
~8 📐), *keystone* (large themed payoff at the tip, 30–40 📐). Costs escalate outward, so a
full tree runs ~400 Blueprints — a long meta-progression across many prestiges. One
Engineering notable, **Auto-Builder** (14 📐), unlocks the automation system (§10).

**Effects are pure stat additions** aggregated by `st(key)` and read by the derived
multipliers (`prod, input, cap, sell, build, mkcost, offcap, offeff, bp, power, grid, fuel,
powerdraw, click, kick, smelt`). Adding tree content is just more data.

**Targeted levers.** Most effects are global, but a few target a *category* to answer a
specific bottleneck. `smelt` (Industry → **Blast Furnace**, +50%) boosts only the
metal-smelting machines (Iron/Copper Furnace, Steel Mill, Alloy Furnace, Foundry — tagged
`smelt:true`). Iron Plate is the load-bearing early intermediate — input to four machines
*and* the universal build material — so it's usually the tightest buffer in Ages I–II. A
global production node can't fix that (it lifts plate demand as much as supply); a
smelter-only lever raises supply alone, so investing in smelting is the deliberate answer to
the plate pinch. This is the template for future category levers (e.g. an assembly-throughput
or robotics-throughput node) as later ages develop their own signature bottlenecks.

**Weaving:** adjacent arms are cross-linked at two rings (the notables and near the tips),
so you can branch sideways between arms instead of only outward — reaching a keystone via a
neighbor, or looping back through the tree.

**Respec:** switch the tree to **Refund** mode to click an allocated node and reclaim its
Blueprints — permitted only if removing it wouldn't strand other nodes (a connectivity
check, so you refund from the outside in). **↺ Respec** refunds the entire tree at once (100%).

**UI:** a pan/zoom SVG canvas — drag to pan, scroll or ± to zoom, ⟳ to recenter,
Allocate/Refund toggle. Nodes are color-coded allocated / available / too-costly / locked
(refundable nodes glow red in Refund mode), with hover tooltips.

---

## 9. Prestige — "Restructure"

Resets resources, Credits, machines, Mk levels, Warehouses, Terminals, and unlocks
(back to the Iron era). Keeps Blueprints + allocated tree nodes. Grants:

```
blueprints = floor( (creditsEarnedThisRun / 10000) ^ 0.6 × (1 + bp-stat from tree) )
```

~$10k/run → 1 📐; ~$100k → 3; ~$1M → 15; ~$100M → 251; ~$1B → ~1000. The 0.6 exponent makes
**big push-runs pay off disproportionately** (that's the punch — one deep run can fill much of
the tree). Enabled once a run would yield ≥1 (~15–20 min for a first prestige). Loop-pacing is
validated in `test/loops.js` (meta reinvestment ≈1.8× faster than not spending, and widening).

### 9a. The prestige wall (v0.24.0–0.25.0 — target ~30h full playthrough)

Prestige is **mandatory**, not optional. Three coordinated levers stop a single run from
brute-forcing the endgame:

0. **Hard age-gate (v0.25.0)** — `AGE_REQ = [0,0,0,0,3,15,50]`: an age's machines stay **locked**
   until you've earned that many 📐 Blueprints *in total* (`stats.bpEarned`, a permanent
   prestige-only metric). Ages I–III are free; **Age IV needs 3 BP, V needs 15, VI needs 50** — so
   you literally cannot unlock robots/probes without Restructuring. Enforced in `machineUnlocked`
   /`refreshUnlocks` (`ageUnlocked(age)`); already-built machines are never re-locked. The Factory
   tab shows a 🔒 banner for the next locked age and the objective bar points to prestige. This is
   the *visible, legible* wall; the two below are the economic pressure that makes it bite.

1. **Exponential cost by tier** (`TIER_MULT`, §5): each machine's per-copy cost scales harder the
   higher its tier (1.15 → 1.55). Late machines get astronomically expensive to stack — e.g. 15
   Probe Assemblers cost >1B credits.
2. **Compressed top-end sells:** high-tier items are the *goal*, not a cash crop (Probe 150K→2.5K,
   AI Core 15K→900, Robot 2.5K→400, Processor 200→90). Run income comes from selling **abundant
   mid-tier materials** (rate-bounded), which grows *linearly* while machine costs grow
   *exponentially* → income asymptotes below cost → the run **walls**.

The only way through the wall is prestige: Blueprint **build-cost discounts** (up to −60%) and
**production multipliers**, plus the permanent per-age dividend, lift the ceiling each loop, so the
age ladder is climbed over **many runs** rather than one. Exact pacing (targeting ~30h) is tuned by
playtest — the greedy sims stall on power before reaching the wall, so they under-measure it.
*Next passes: more content depth per age (new intermediates/machines/sub-goals), then fine-tuning.*

---

## 10. Automation & Achievements

**Auto-Builder** — unlocked by the *Auto-Builder* node in the Engineering arm (14 📐). Once
unlocked, every machine and generator card gains an **Auto** toggle, and a master **🤖
Auto-Build ON/OFF** appears in the Manual panel. Flagged items are trickle-built (one every
~300 ms) whenever their credit + component costs are affordable — keeping the line topped up
without draining you dry. It reuses the same batch planner as manual building and counts
toward the "machines built" stat.

**Achievements** — 16 latching milestones on lifetime metrics: credits earned, machines
built, Restructures, tree nodes allocated, Blueprints earned, plus one-off builds (a Robot
Assembler, a Fusion Reactor, 10 Warehouses). Each grants a **small permanent stat bonus**
summed by the same `st()` aggregator as the tree, so rewards feed straight back into the
economy. Completions latch permanently (they survive Restructure) and are shown in the
Achievements panel on the Stats tab. Progress is tracked via cumulative counters
(`stats.built`, `stats.bpEarned`, `stats.allocs`) plus `lifetimeCredits` and `prestiges`.

---

## 11. Talent Tree (Talent Points ✦)

The **efficiency** meta layer — it *only cuts costs*, never adds multipliers, so it never
overlaps the Advancement Tree (§8). Deliberately distinct on four axes: **domain** (cost
reduction vs. capability), **currency** (✦ vs 📐), **structure** (ranked tiers vs. a graph),
and **source/timing** — Talent Points are earned from **cumulative production** as you play,
so Talents come online *early* (no prestige needed), while Advancements are a prestige reward.

- **Earning ✦:** `earned = floor(sqrt(totalProduced / 100))`, dripped as your machines output
  materials (online and offline). Running a bigger factory earns Talent Points faster.
- **9 talents in 3 tiers.** Tier 2 unlocks after 5 ✦ spent total, Tier 3 after 15. Each rank
  costs `tier × (rank+1)` ✦, so deeper ranks and higher tiers cost progressively more.
- **Flagship — raw-material cost reduction.** *Efficient Extraction* (−3%/rank) and *Master
  Extractor* (−5%/rank) feed a `rawcost` stat that cuts how much **tier-0 raw material** (ore,
  coal, stone, oil, sand) your furnaces/refineries consume per craft — capped at −80%. It's
  separate from the general `input` cut (*Lean Process*, *Recyclers*, *Zero Waste*) which
  shaves *all* inputs.
- **The rest are also cost cuts:** Fuel Economy (generator fuel), Thrifty Builds & Grand
  Overhaul (machine build cost), Precision Tooling & Grand Overhaul (Mk upgrade cost). Every
  rank-effect sums into the same `st()` aggregator as the tree, milestones, and achievements.
- Talents persist across Restructure. **UI:** the 🎯 Talents tab — tier-grouped cards with
  rank X/max, current effect, and an Upgrade button; locked tiers show their unlock threshold.

---

## 12. Patents (deep prestige — ⚛)

The endgame layer *above* Blueprints. Unlocks once you've earned **15 Blueprints** total.

- **File Patent** performs a deeper reset than Restructure: it wipes the factory, Credits,
  **all Blueprints, and the entire Advancement tree** — but keeps **Talents, Achievements,
  and Patents/patent-upgrades**. It grants `floor(sqrt(blueprintsThisCycle / 50))` Patents.
- **Patent upgrades are permanent through *everything*** (both Restructure and File Patent),
  which makes them the strongest bonuses in the game and the reward for the big reset:
  Industrial Legacy (+25% production/lvl), Vast Reserves (+50% caps/lvl), Trade Empire (+25%
  sales/lvl), Research Grants (+25% Blueprint gain/lvl), Power Doctrine (+50% generator
  output/lvl), Automation Mandate (+25% production & storage/lvl). Costs scale `base × (level+1)`
  ⚛, so this is the **infinite scaling sink** that backs up the punchy meta.
- Effects sum into the same `st()` aggregator as the tree, talents, milestones. **UI:** the
  ⚛ Patents tab (shows a locked hint until unlocked, then File Patent + upgrade cards).

---

## 13. Systems

- **Tick:** 100 ms, real wall-clock delta (clamped 5 s/tick; big gaps → offline calc).
- **Simulation:** power resolved first (fuel-free supply + base grid, then Steam burns Coal
  to fill the gap), giving a `powerRatio`. Machines processed raw→finished each tick;
  throughput = `count × rate × globalMult × mkMult × powerRatio × dt`, clamped by inputs and
  output space; then inputs consumed, outputs added. Input amounts apply the global
  input-efficiency, plus an extra `rawcost` cut on tier-0 (raw) materials from Talents.
  Continuous floats → smooth flow, no lag.
- **Progressive unlocks** re-evaluated each tick; newly available machines toast and are
  injected into the DOM (structure rebuilt only when the unlock set changes).
- **Net-rate readouts** are measured from real per-tick deltas and smoothed.
- **Offline:** `min(away, cap)` simulated in ≤600 sub-steps at offline efficiency; a
  "Welcome back" modal summarizes the top gains.
- **Save:** localStorage, autosave 5 s + on unload; base64 export/import with a forward-
  compatible `migrate()` that backfills new items/machines/generators onto old saves and
  refunds any pre-tree research points back into Blueprints.
- **Numbers:** K/M/B/T… then scientific, 3 sig figs.
- **Testing:** a Node harness (`test/harness.js`) loads the real game script into a VM with a
  stub DOM and exposes the pure logic — no duplicated code. `node test/test.js` runs the
  assertion suite (150+ checks); `node test/balance.js` auto-plays a greedy strategy and prints
  the pacing curve (time-to-first-prestige, when power bites, deep-tier timings).
- **Juice:** floating "+$"/"+ore" text on sells & mining, a screen flash on prestige, and a
  live **objective bar** that always names your next goal.
- **Sound:** short SFX **synthesized at runtime via Web Audio** (no asset files, so it stays a
  single self-contained file) — distinct blips/arpeggios for click/sell/build/unlock/goal/age/
  prestige. `sfx()` no-ops without an AudioContext, so engine calls are harness-safe. Toggled by
  the 🔊 header button (persisted); AudioContext is created on first interaction.
- **Accessibility/polish:** honours `prefers-reduced-motion` (neutralizes animations), emoji favicon,
  and a visual-polish layer (panel/card depth + gradients, active-tab accent underline, affordable/
  prestige button glow, card hover lift, themed scrollbar).
- **Balance:** tuned with the sims; the loop probe caught an Age III power wall — Solar was
  unlockable at the Circuit Fab but its recipe needed Silicon (an Age later), so it's now Steel+Circuit.

---

## 14. UI map

Top bar (Credits +/s · Blueprints · **⚡ Power %** · **🔊 sound** · **📊 HUD** · Restructure) → tab nav → **objective bar**
(your current goal) → always-visible resource ticker (amount / cap, flow rate, fill bar, "$" sell).
Each chip leads with **net gain** (a bold, signed, colour-coded `±X/s` — green growing / red draining,
so "is my stockpile piling up?" is obvious), with **gross production** as a small `▲X/s` badge (how much
you're actually making, smoothed from `stats.made` deltas). A buffer pinned at cap shows its **production *capacity*** (`potRate` — potential
output *before* full-buffer backpressure, tracked via `potMade` in `simulate`) plus the **spare/s**
being idled (`potRate − prodRate`), e.g. `▲11/s · full +6.6/s spare` — so you can see true output and
plan even when net ≈ 0. Hover reveals making/capacity/net. Reading net + production + capacity together
makes bottlenecks and overproduction legible even when the stockpile isn't moving.

**Session HUD** (📊 top-bar button or the `` ` `` key) — a lightweight, always-on-top playtest
overlay that instruments a live run: session time, current Age, income/min, power % + accumulator
charge, the current **bottleneck** (the emptiest *consumed* buffer + its net/s — the same starvation
signal Auto-Balance acts on), **chain health** (starved vs full machine counts), machine/prestige/patent
totals, **manual-click count** (an engagement proxy — near-zero late-game means the run has gone fully
passive), and **per-Age pacing** (wall-clock time each Age was first reached). It's a tuning instrument,
off by default, and reads live state without perturbing it.

- **🏭 Factory** — Manual mine; a **×1/×10/Max** buy-mode toggle; a master **Auto-Build**
  toggle (once unlocked); machines grouped by tier, each card: icon, Mk badge, count, recipe
  (missing inputs in red), status, **Build ×N** + **Mk↑** + **Auto** buttons.
- **⚡ Power** — grid supply/demand/load bar; generator build cards (Build + Auto).
- **📦 Storage & Trade** — Warehouses; Trade Terminal build/upgrade + sell-target select.
- **🌳 Advancements** — the pan/zoom passive tree; click nodes to allocate Blueprints.
- **🎯 Talents** — tier-grouped ranked talents spent with Talent Points (efficiency/cost cuts).
- **⚛ Patents** — File Patent (deep reset) + permanent patent upgrades (locked until 50 BP earned).
- **📊 Stats** — totals, the **Achievements** grid, offline info, Save/Export/Import/Changelog/Hard-reset.
- **🗺️ Ages Roadmap** — click the age bar to open a modal (`ageRoadmap()`) listing all six ages with
  status (mastered/current/reached/unlocked/locked), Blueprint unlock cost (`AGE_REQ`), signature
  (`AGE_SIG`), and goal progress. Makes the hard-gated ladder (§9a) legible and aspirational.

---

## 15. Ages (the macro-journey)

The six tiers are grouped into named **Ages** that give the game a spine and celebrated
milestones. `TIER_AGE = [1,1,2,3,4,5,6]` maps tiers → ages; machines are grouped by Age in
the Factory tab, with an **age banner** up top.

| Age | Tiers | Signature |
|---|---|---|
| I · Stone & Iron | Extraction + Smelting | **Prospecting** — mine to strike Rich Veins (raw-extraction surge) |
| II · Machine | Basic Components | **Overclock** — +50% speed for +50% input (speed vs efficiency) |
| III · Industrial | Advanced Components | the Power grid + **Accumulators** (Phase 2) |
| IV · Automation | Complex Assemblies | the Auto-Builder + **Auto-Balance** (Phase 2) |
| V · Robotic | Robotics | **Workforce** — deploy Robots as workers (Phase 2) |
| VI · Space | Singularity Tech | **Von Neumann Fleet** — launch Probes → a self-replicating idle engine (+ infinite Patents) |

- **`currentAge`** = the highest age you've built a machine in this run; **`maxAge`** = the
  highest ever reached (latched, persists through Restructure *and* File Patent).
- **Reaching a new Age (ever)** fires a celebration modal + flash and grants a **permanent
  +10% production** (via a `maxAge` dividend summed into `st('prod')`). Re-reaching an age on
  a later run is a smaller toast, no re-grant — so you can't farm it.
- **Prestige model:** Restructure drops you to Age I; your meta (tree/talents/patents + the
  age dividend) lets you re-climb fast, and the goal each run is to push a *higher* age than
  before. This is why Ages and prestige reinforce rather than fight each other.
- Deepening happens **one age at a time** (each can gain a signature mechanic, a wider chain,
  and an age goal) — the incremental content pipeline.

**Phase 2 — Space-Age signature + endgame engine: the Von Neumann Fleet (v0.28.0).** Launch `probe`
items into a **permanent** fleet (`launchProbes`; survives Restructure *and* Patents). The fleet
**self-replicates logistically** in `simulate` — `fleet += fleet·FLEET_REPLICATE·(1−fleet/cap)·dt` — so
it grows on its own (offline too) toward `fleetCap = launched·FLEET_CAP_MULT` (20). Launching more probes
raises the cap → always a reason to keep building them (endless, but governed by your probe output). It
grants a permanent, **log-diminishing production boost** `fleetBonus = FLEET_MULT·log10(1+fleet)` folded
live into `globalRate()`. This is the payoff for finishing the ~30h climb: an idle engine that compounds
across every future run. Numbers stay sane via the cap + log benefit. *(All six ages now have a signature.)*

**Phase 2 — Machine-Age signature: Overclock (v0.27.0).** A toggle (shown once `maxAge ≥ 2`) that runs
**every machine ×`OC_SPEED` (1.5) throughput** while multiplying **input consumed per cycle by `OC_INPUT`
(1.5)** — so `+50%` output costs `+50%` input *per cycle*, i.e. worse material efficiency (`ocSpeed()` on
`cyc`, `ocInput()` folded into `inF` in `simulate`). Deliberately **power-neutral** to stay distinct from
the power-based signatures (Accumulators/Workforce); the decision axis is *material surplus*, not grid. A
persistent preference (survives Restructure). Speed when you can afford the waste; efficiency when you can't.

**Phase 2 — Stone-Age signature: Prospecting (v0.26.0).** Manual mining charges a Prospect meter
(`PROSPECT_MAX = 20` clicks); filling it strikes a **Rich Vein** — `VEIN_DUR = 30`s of `+VEIN_BONUS`
(50%) to **all raw (tier-0) extraction** and hand-mining (`prospectMult()` multiplies tier-0 output in
`simulate`, and `orePerClick`). Per-run (resets on Restructure). It's optional upside that rewards active
early play and *fades naturally* late-game (you stop clicking) — the right shape for an Age-I hook.

**Phase 2 — Robotic Age signature: the Workforce.** Robots (a high-value product) can be
**deployed** as workers instead of sold or fed to Probes: production bonus = `√deployed ×
5%` (diminishing). It's an **in-run** layer (resets on Restructure), which rewards deep pushes
and synergizes with the deep-run-rewarding Blueprint curve (deploy → more production → bigger
run → more BP). Panel lives in the Factory tab, shown once you reach Age V. Recall respects
the Robot storage cap.

**Power upkeep (v0.23.0).** Each deployed robot draws `WORKFORCE_MW = 0.5` MW of grid power
(added to demand in `computePower`). Because upkeep is **linear** in `deployed` while the bonus
is **√**, the marginal robot always costs proportionally more power than it returns production —
so the workforce **self-limits** at whatever your grid can sustain, instead of snowballing for
free. Fielding a large workforce is now a real power *investment* (build generators/accumulators),
and over-deploying browns out the whole factory (the panel warns when the grid can't cover it).
This is the general pattern for signatures: an impactful lever that must be *resourced*, not a
free button. This is the template for future per-age signatures.

**Phase 2 — Industrial Age signature: Accumulators.** Each accumulator adds `80 MWh` of storage
(built like generators/warehouses, unlocked at the Circuit Fab). In `computePower`, surplus power
(base grid + fuel-free generators beyond demand) **charges** the bank; a deficit **discharges** it
to cover the gap, holding the power ratio at 100% until it drains. Value is highest during demand
*spikes* — notably the Auto-Builder's batch-builds — so Age III's battery deliberately sets up Age
IV, and it makes fuel-free generators (which do the charging) more valuable. Per-run infrastructure
(resets on Restructure). Lives in the ⚡ Power tab.

**Phase 2 — Automation Age signature: Auto-Balance.** A toggle (shown once the Auto-Builder is
unlocked *and* you've reached Age IV) that changes the auto-builder from "buy 1 of each flagged
machine" to "repeatedly buy the flagged machine whose output buffer is **emptiest**" — i.e. the
current bottleneck — up to 25 builds/tick. This maintains chain ratios automatically; its bursty
batch-buys pair with Age III's accumulators (which absorb the demand spikes).

**Phase 2 — Wider chains:** the early ages were a single thread, so parallel + interconnecting
branches are being added (all purely additive — no existing recipe changes):
- **Alloy Furnace** (Machine Age): 2 Iron + 1 Copper Plate → **Alloy**. Competes for Plates → an
  early cash-vs-tech decision.
- **Foundry** (Machine Age): 1 Alloy + 1 Coal → **Steel** — the *forward-feeding* piece. It turns
  Alloy from a sell-sink into a real chain node: a **copper-fed route to Steel** that lets you route
  around an iron-plate bottleneck (a balanced sidegrade, since it spends copper instead of iron).
- **Cement Kiln** (Stone & Iron Age): 2 Stone + 1 Coal → **Concrete** — gives the very start a
  second parallel product beyond the Iron line.
- **Motor Winder → Gearworks** (Advanced/Complex): Copper Wire + Steel → **Electric Motor**, then
  Motor + Gear → **Mechanism**. A second, interconnecting way to make Mechanisms that uses **no
  circuits** — de-linearizes the copper line (Copper Wire gets a second use) and lets you shift
  Mechanism output off circuits to free them for Processors. A sidegrade (costs extra machines +
  steel), gated behind the Assembler so it doesn't skip progression.

**Phase 2 — Age Goals.** Each age has **one headline goal** — produce a cumulative amount of its
key product — that grants a big **permanent, age-themed reward** when mastered:

| Age | Goal | Reward |
|---|---|---|
| I Stone & Iron | 5,000 Iron Plates | +15% production |
| II Machine | 5,000 Gears | +20% production |
| III Industrial | 3,000 Circuits | +50% generator output |
| IV Automation | 1,000 Mechanisms | +25% production |
| V Robotic | 200 Robots | +30% production |
| VI Space | 20 Von Neumann Probes | +50% Blueprints |

Tracked via a per-item cumulative counter (`stats.made`), latched on completion (permanent, survives
Restructure), and fed into `st()` like every other bonus. Deliberately **distinct from Achievements**:
one clear objective per age with **live progress in the age banner** (and a full list in Stats), versus
Achievements' scattered collection of small milestones. Rewards are themed to the age (Industrial →
power, Space → Blueprints).

Still open: more interconnecting branches; a possible second per-item widening for the late tiers.

---

## 16. Roadmap

- **Power accumulators** (battery storage) to buffer supply and smooth night/offline dips.
- **More Patent upgrades** (and maybe a third layer) as the Patent economy matures.
- **Per-resource storage upgrades** (targeted caps) alongside global Warehouses.
- **Auto-Build policies** (ratio targets, budget caps) beyond simple per-item flags.
- **More tiers** past Von Neumann Probes (Dyson swarms, megastructures) to extend the route further.
- **Sound** and richer animation to build on the new juice pass.
- **A flow/bottleneck visualizer** for the whole factory (top idea from the design review).

See `index.html` for the implementation and `README.md` to run it.
