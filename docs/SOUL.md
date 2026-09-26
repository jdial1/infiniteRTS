# The Soul of infiniteRTS

This game's design soul is defined in the [game-souls](https://github.com/jdial1/game-souls) library, in `instances/infinite_rts.txt`. This file is the instillation report behind it: what the build looked like measured against that soul, what has been fixed, and what is still open. It follows Step 8 of `LLM_SOUL_GUIDE.txt`.

**Soul:** Assembly-led blend with Tapestry.
**Philosophy:** *"The machine must grow, and every tile it grows onto is a tile someone else wanted."*
**The fortieth minute:** Calm, because the machine feeds itself and its border was built right, and never quite calm, because a neighbour is measuring that border.

## Instilling the soul into the build as found (commit `cef3f44`)

### Tone killers found

| Killer | Evidence | Status |
| --- | --- | --- |
| Resources that arrive without a worker (the Magic Void) | Sovereign Tax, Photon Plates, Vacuum Cores, and refinery and market outposts all added resources on a timer, from nothing | **Fixed.** Income now only arrives with a worker; see below |
| A loss with no receipt | Buildings and outposts could be destroyed or neutralized while the owner was away, with no record. The combat feed showed every fight on the server as "Turret attack hit for 10 damage!" and then cleared it after 10 s | **Fixed.** Per-player ledger, a "While You Were Away" report, and a combat feed limited to your own fights |

### Structural conflicts

| Conflict | Evidence | Status |
| --- | --- | --- |
| Competitive stakes vs. client authority | `move` accepts any position the client sends; every building and unit goes to every client, and fog is drawn only on screen | Open (recommendation 5) |
| Automation vs. automating the decision | Auto-assign (on by default) picks which resource gets each new worker | Open (recommendation 6) |
| Generator economy vs. no infinite sink | Upgrades are the only sink: linear effects at exponential costs, so buying stops | Open (recommendation 8) |

### Axis gaps

| Axis | Soul | Build as found | Change |
| --- | --- | --- | --- |
| Failure | Costly | Costly, but losses were invisible | Ledger (done) |
| Information | Total rules, Observed rival state | Rules misstated in four tooltips; fog readable in network data | Honest tooltips (done); server-side vision (open) |
| Tone | Watchful Calm | Undercut by losses from nowhere and income from nowhere | Both killers fixed |
| Authorship, Power, Structure | Build / Optimization / Persistent World | Match | None; see the cost warning about persistence |

### Pitfalls found (with evidence in the code)

| Pitfall | Evidence | Fix / Status |
| --- | --- | --- |
| Dominant Strategy | At level 1, Photon Plates made a 10-stone wall return 1 wood + 1 stone every 2 s, forever: it paid for itself in 20 s. Walls also score 50 each | Income: fixed. Score: open (recommendation 7) |
| Flavourful Lie | "+10 capacity" gave +1; "10% cheaper" gave 1%; "+5 extraction" gave +1; "+25% speed" gave +1% | Fixed: descriptions state what the code does |
| Illegible Chaos | Global, anonymous combat feed | Fixed |
| Silent stall | An idle worker targeted the nearest node of its type even when that node was outside the borders, was rejected, and retried the same node forever, with nothing on screen | Fixed: workers skip nodes they can't mine and report a stall reason |
| Cheater Epidemic | Client-authoritative hero position | Open |
| Game Plays Itself | Auto-assign on by default | Open |
| Spaghetti Wall | No way to demolish or refund your own buildings | Open (recommendation 9) |
| Theme as Paint | Soviet menus ("Red October", "Commissariat") alongside sci-fi upgrades ("Quantum Cargo") | Open (recommendation 10) |

### Litmus results (after commit `40edb6f`)

| Check | Result | Note |
| --- | --- | --- |
| The Math | Pass | Labour split against build spend is the core loop |
| The Legs | Pass | Fixed: every resource now arrives with a worker |
| The Chores | **Fail** | Auto-assign makes the labour decision |
| The Canvas | **Fail** | You can't demolish your own buildings, so rebuilding costs everything |
| The Ledger | **Fail** | The leaderboard ignores outposts and rewards walls |
| The Receipt | Pass | Fixed: every destruction, capture, and neutralization is logged by name |
| The Hands | Pass | The hero has no attack |

## What changed in commit `40edb6f`

* **Income travels.** Passive generation is gone. The old upgrades became logistics:
  * **Quartermaster's Cut** (was Sovereign Tax): loads unloaded at the Command Base yield +5% per level.
  * **Supply Roads** (was Photon Plates): workers move +10% faster per level within 150 of your walls.
  * **Forward Depots** (was Vacuum Cores): workers can unload at your turrets. One level.
  * **Refinery / market outposts:** gold unloaded at a refinery yields +50%; wood and stone unloaded at a market yield +25%.
* **Losses get receipts.** The server keeps the last 50 map changes per player (destroyed, taken, neutralized, and by whom). They're pushed live to the combat feed. On reconnect, anything that happened since you left appears in a "While You Were Away" report; click a line to jump to it.
* **Workers explain themselves.** Workers choose the nearest node they can actually mine. When there's none, or no depot to unload at, the worker panel shows why ("1 stalled: No stone left inside your borders").
* **Numbers tell the truth.** Every upgrade description states its real per-level effect. The worker price preview now includes the Logistics trait discount the server was already applying. A pre-existing type error in `server.ts` is fixed, so `npm run lint` passes.

## Prioritized recommendations

Ordered as the guide ranks them: tone killers, then structural conflicts, then axis gaps, missing Core components, pitfalls, and pillars.

| # | Mechanic → | Dynamic → | Tone | Status |
| --- | --- | --- | --- | --- |
| 1 | Remove resources from nothing; upgrades act on routes | Players lay walls along worker paths and put turrets where loads can land | The focus of a routed machine | Done |
| 2 | Ledger and "While You Were Away" report | A returning player reads which border failed and who did it before looking at the map | Danger with a name keeps the calm | Done |
| 3 | Honest tooltips | Purchases are planned on paper, and trusted | Cool Focus | Done |
| 4 | Stall reasons; workers skip nodes they can't mine | A stall reads as a nudge to expand, not as a bug | The Squeeze, felt as a decision | Done |
| 5 | Server clamps hero movement to that hero's legal speed; send each client only what its vision covers | Captures are won by routing, and fog hides what it claims to | Losses are trusted, so the watch is worth keeping | Open |
| 6 | Replace auto-assign with a player-set ratio (e.g. 3:2:1) that new workers follow | Players think about the split once and revise it when the bottleneck moves | Ratio over Capacity stays the player's puzzle | Open |
| 7 | Leaderboard counts held outposts and territory; walls score little or nothing | Players expand and hold instead of carpeting | The map is the ledger | Open |
| 8 | An infinite sink: "the Plan", phased deliveries to the base, visible to rivals | There's always a reason to route more, and a rival's progress is readable | Always a reason to consume | Open |
| 9 | Demolish your own building for a full refund | Borders get redesigned as the frontier moves | Refactoring is free; only rivals take | Open |
| 10 | Settle the setting: make the Plan and the commissariat do mechanical work, or drop the flavour | The fiction explains the verbs instead of decorating them | Integration | Open |
| 11 | Rates panel per resource and per depot | Players see which route pays | Show the Rates | Open |

## Cost warning

* **The server is part of the design.** Competitive ground needs server-side movement, vision, and captures, and a world that survives a restart. Today the whole world lives in memory, and one restart erases every border.
* **Losses while away are deliberate.** The ledger explains them; it doesn't prevent them. Whether absent players also need a protection window is a question for the first playtest, not something to add before one.
* **Neighbours are required.** Watchful Calm needs rivals at the border. An endless map with a small population will feel like Assembly without its second half.
