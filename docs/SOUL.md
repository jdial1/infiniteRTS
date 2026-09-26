# The Soul of infiniteRTS

This game's design soul is defined in the [game-souls](https://github.com/jdial1/game-souls) library, in `instances/infinite_rts.txt`. This file is the instillation report behind it: what the build looked like measured against that soul, and what was changed to close each gap. It follows Step 8 of `LLM_SOUL_GUIDE.txt`.

**Soul:** Assembly-led blend with Tapestry.
**Philosophy:** *"The machine must grow, and every tile it grows onto is a tile someone else wanted."*
**The fortieth minute:** Calm, because the machine feeds itself and its border was built right, and never quite calm, because a neighbour is measuring that border.

## What the build looked like (commit `cef3f44`)

### Tone killers

| Killer | Evidence | Fixed in |
| --- | --- | --- |
| Resources that arrive without a worker (the Magic Void) | Sovereign Tax, Photon Plates, Vacuum Cores, and refinery and market outposts all added resources on a timer, from nothing | `40edb6f` |
| A loss with no receipt | Buildings and outposts could be destroyed or neutralized while the owner was away, with no record. The combat feed showed every fight on the server as "Turret attack hit for 10 damage!" | `40edb6f` |

### Structural conflicts

| Conflict | Evidence | Fix |
| --- | --- | --- |
| Competitive stakes vs. client authority | `move` accepted any position; every building, unit, and player inventory was sent to every client, and fog was drawn only on screen | The server clamps movement to a speed budget, and sends rival state only inside the receiver's vision |
| Automation vs. automating the decision | Auto-assign picked which resource each worker mined | Standing Orders: the player sets the split, the server keeps it |
| Generator economy vs. no infinite sink | Upgrades were the only sink | The Plan |

### Pitfalls (evidence in the code)

| Pitfall | Evidence | Fix |
| --- | --- | --- |
| Dominant Strategy | Photon Plates walls paid for themselves in 20 s; walls also scored 50 each | Passive income removed; walls score nothing |
| Flavourful Lie | Four upgrade descriptions overstated their effect by up to 25x; Fortitude claimed to protect units | Descriptions state what the code does |
| Illegible Chaos | A global, anonymous combat feed | Only your fights, by name, and only fights you can see |
| Silent stall | Workers retried an unminable node forever | Workers skip it, and report a stall reason |
| Cheater Epidemic | Client-authoritative hero position; free outposts via `build {type:'outpost'}` | Server-side movement budget; only bases, walls, and turrets can be built |
| Seal by Convention | Fog hid rivals on screen, but their state was in the data | Server-side vision |
| Game Plays Itself | Auto-assign on by default | Standing Orders |
| Spaghetti Wall | No way to tear down your own buildings | Demolish |
| Sinkhole Economy | Nothing to consume without limit | The Plan |
| Theme as Paint | Soviet menus, sci-fi upgrades | Soviet-industrial throughout; the Plan does mechanical work |
| Absent heroes | A logged-off hero parked in an outpost's ring kept capturing it | Only heroes whose commander is online stake ground |

### Litmus results (current build)

| Check | Result | Note |
| --- | --- | --- |
| The Math | Pass | Labour split against build spend is the core loop |
| The Legs | Pass | Every resource arrives with a worker (the Plan draws from the purse those workers filled) |
| The Chores | Pass | Standing Orders keep a ratio the player chose |
| The Canvas | Pass | Demolishing an undamaged building refunds it in full |
| The Ledger | Pass | Standings count held outposts and Plan phases, nothing else |
| The Receipt | Pass | Every destruction, capture, and neutralization is logged by name |
| The Hands | Pass | The hero has no attack |

## What changed

### Commit `40edb6f`: income travels, losses get receipts, numbers tell the truth

* Passive generation removed. The old upgrades became logistics: **Quartermaster's Cut** (+5% per level on loads unloaded at the base), **Supply Roads** (workers +10% faster per level near your walls), **Forward Depots** (turrets accept deliveries). Refinery and market outposts boost the loads unloaded at them.
* A per-player ledger of map changes, a live combat feed limited to your own fights, and a "While You Were Away" report on reconnect.
* Workers skip nodes they can't mine and report why they stalled. Upgrade descriptions match the code.

### This commit: the open recommendations

* **Server authority.** The hero spends a movement budget that refills at its legal top speed, with a little headroom for frame timing. A report that outruns it is cut short, and the client is corrected. Only bases, walls, and turrets can be built.
* **Real fog.** Rival buildings, workers, and heroes are only sent inside the receiver's vision. That vision is the union of its hero, base, turrets, outposts, walls, and workers. Seen buildings are remembered until their spot is back in view. Outposts and their owners stay public: the political map is public, and what stands on it is not. Rival inventories and upgrades are never sent.
* **Standing Orders.** You set a wood:stone:gold split (0–9 each, default 1:1:1). The server keeps it as workers are bought, and reassigns workers when you change it. Turn it off to assign workers by hand.
* **The Plan.** An endless series of phases delivered to the Command Base. Phase 1 asks for 300 wood, 300 stone, and 100 gold, and each later phase asks for 1.35x the last. A delivery commits at most a quarter of the phase, so one click can't empty the purse. Each fulfilled phase is a ledger line and a standings milestone.
* **Standings.** Computed on the server: 100 per outpost held, plus 150 per Plan phase fulfilled. Walls, workers, upgrades, and stockpiles score nothing. "Locate" only works for players you can see.
* **Demolish.** A tool in Structures. It refunds what you paid, scaled by remaining health: full while undamaged, so redesigning is free, but a burning building can't be sold to escape a rival. The cursor shows the refund before you commit.
* **Rates.** The server logs every delivery. The resource bar shows income per minute, and the worker panel lists each depot's last-minute deliveries; click one to jump to it.
* **Persistence.** The world is saved every 30 s and on shutdown, and reloaded at start: to Cloud Firestore in production, to `saves/world.json` locally. Ledgers and last-seen times are saved too, so away reports stay accurate across restarts.
* **Setting.** Soviet-industrial throughout: the Plan, the Commissariat report, Directives, and upgrade names such as Shock Brigades, Heavy Barrows, and Central Planning. The help text describes the systems as they are.

## Cost warning

* **Losses while away are deliberate.** The ledger explains them; it doesn't prevent them. Absent heroes no longer hold ground. Whether absent players also need a protection window is a question for the first playtest.
* **Neighbours are required.** Watchful Calm needs rivals at the border. An endless map with a small population will feel like Assembly without its second half.
* **Scale.** Vision is computed per player twice a second, against every building and unit. That's fine for dozens of players. Hundreds will need spatial indexing.
* **One world, one process.** The world lives in one Cloud Run instance's memory and is saved to Firestore every 30 s, so a crash can lose up to 30 s of play. Two instances would be two worlds; scaling out means sharding the map across servers.
