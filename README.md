# COGWORKS ⚙️

A browser-based **idle factory game**. Refine Ore → Plates → Gears → Circuits, sell
for Credits, reinvest, and **Restructure** to earn permanent Blueprints. Advance through
six **Ages** — Stone & Iron → Machine → Industrial → Automation → Robotic → Space — each a
celebrated milestone that permanently powers you up, with a **goal** to master for an even
bigger permanent reward.

## Run it

**Just double-click `index.html`** — it opens in your browser and plays immediately.
No install, no server, no internet needed. The whole game is one self-contained file.

Your progress saves automatically to your browser (localStorage) every 5 seconds and
when you close the tab. Offline progress is applied when you return.

> Tip: if you want to move your save to another computer, use **Export** (bottom bar)
> to copy a save code, then **Import** it on the other machine.

## Files

| File | What it is |
|---|---|
| `index.html` | The complete game (HTML + CSS + JS, no dependencies) |
| `DESIGN.md` | Full design doc — mechanics, numbers, balance, roadmap |
| `README.md` | This file |

## How to play

1. **Mine** Iron Ore by hand and **sell** it (the “$” on its chip) to afford your first
   **Miner**, **Coal Drill**, and **Iron Furnace**.
2. Iron Plates unlock the next tier. **Machines are built from components** — a Gear
   Press needs Iron Plates, a Circuit Fab needs Copper Wire + Gears, and so on. So to
   expand you first build the supply lines that feed the next machine's recipe. Use the
   **×1 / ×10 / Max** toggle to build in bulk once you're scaling up.
3. Watch the readouts. A resource chip's bar turns **red** when its buffer is **full** —
   that *throttles everything upstream* (backpressure). Machines show **⚠ starved** (need
   more input) or **■ output full** (need more storage or downstream capacity).
4. Keep an eye on **⚡ Power** in the header. As you grow, demand outgrows the free 20 MW
   base grid and the whole factory slows down. Build generators in the **⚡ Power** tab —
   **Steam Engines burn Coal** (which competes with your furnaces!), while Solar and Fusion
   cost no fuel but need advanced components.
5. Raise storage caps with **Warehouses** (📦 Storage & Trade), and build a **Trade
   Terminal** there to auto-sell for a steady Credit income — pick a single resource, or
   choose **⚙️ Sell overstock** to automatically clear whatever's piling up (the surplus
   above 90% of each cap, fullest buffer first) so overflow never throttles your line.
6. Upgrade any machine's **Mk** level (+50% throughput each) — this also spends components
   *and* raises its power draw, so growth competes with production on every front.
7. When growth stalls, **Restructure** for **Blueprints** and spend them in the **🌳
   Advancements** tree — a large passive tree you path through outward from the Core
   (drag to pan, scroll to zoom), picking permanent boosts across six themed arms and
   powerful **keystones**. Adjacent arms are cross-linked so you can weave between them.
   Allocations persist across every Restructure — and you can switch to **Refund** mode to
   reclaim individual nodes, or **↺ Respec** the whole tree, to reshape your build.
8. Grab the **Auto-Builder** node in the tree's Engineering arm to unlock automation — then
   hit the **Auto** button on any machine/generator so it builds itself (toggle it all with
   the master **🤖 Auto-Build** switch). Great for cutting late-game clicking.
9. Chase **🏅 Achievements** (Stats tab) — hitting lifetime milestones grants small permanent
   bonuses that stack with everything else, forever.
10. As you produce materials you earn **✦ Talent Points** (no prestige needed) — spend them in
    the **🎯 Talents** tab. Talents are the *efficiency* layer: they only **cut costs** — raw
    materials, inputs, fuel, build & Mk cost (flagship: **Efficient Extraction** / **Master
    Extractor**). The 🌳 Advancements tree is the separate *power* layer (production, capacity,
    unlocks). Two trees, two currencies, two jobs.
11. Late game: once you've earned 50 Blueprints total, the **⚛ Patents** tab unlocks. **File
    Patent** for a deep reset (wipes the factory, Blueprints, and the Advancement tree) in
    exchange for Patents — spent on **permanent** global upgrades that survive every reset.

Want to see *where* a run drags? Hit the **📊 Session HUD** (top-bar button or the `` ` `` key)
for a live playtest overlay: income/min, your current **bottleneck** (the emptiest consumed
buffer), chain health (starved vs full machines), power + charge, manual-click count, and how
long each Age took to reach. It's a tuning instrument — off by default and purely read-only.

A live **objective bar** at the top always tells you your next goal, so you're never lost.
The chain runs Iron → Copper/Steel → Circuits → Assemblies → Robots → **AI Cores → Von Neumann
Probes**, all riding on a power grid you have to keep fed. Have fun untangling the supply web.

## Development

The game is one self-contained `index.html` (no build step). Logic is covered by a headless
test harness that loads the real script into a Node VM — no duplicated code:

```
node test/test.js       # assertion suite (sim, power, prestige, migration, talents, patents…)
node test/balance.js    # auto-plays a run and prints the pacing curve
```
