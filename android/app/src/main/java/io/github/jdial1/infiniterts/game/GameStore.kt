package io.github.jdial1.infiniterts.game

import io.github.jdial1.infiniterts.model.Building
import io.github.jdial1.infiniterts.model.ChunkPayload
import io.github.jdial1.infiniterts.model.CombatEvent
import io.github.jdial1.infiniterts.model.GameConfig
import io.github.jdial1.infiniterts.model.GameJson
import io.github.jdial1.infiniterts.model.HealingEvent
import io.github.jdial1.infiniterts.model.InitPayload
import io.github.jdial1.infiniterts.model.LedgerEntry
import io.github.jdial1.infiniterts.model.LedgerHistory
import io.github.jdial1.infiniterts.model.MapZone
import io.github.jdial1.infiniterts.model.Player
import io.github.jdial1.infiniterts.model.RatesReport
import io.github.jdial1.infiniterts.model.ResourceNode
import io.github.jdial1.infiniterts.model.Resources
import io.github.jdial1.infiniterts.model.ScoreRow
import io.github.jdial1.infiniterts.model.StateTick
import io.github.jdial1.infiniterts.model.VisionPayload
import io.github.jdial1.infiniterts.model.Worker
import io.github.jdial1.infiniterts.model.XY
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlin.math.floor

/**
 * Everything this client knows about the world, updated from server events. Pure Kotlin (no
 * Android), so it can be unit-tested; the app applies events to it on the main thread.
 */
class GameStore(val config: GameConfig, val myId: String) {
    val players = LinkedHashMap<String, Player>()
    val buildings = LinkedHashMap<String, Building>()
    val workers = LinkedHashMap<String, Worker>()
    val resources = LinkedHashMap<String, ResourceNode>()
    val zones = LinkedHashMap<String, MapZone>()

    var initialized = false
        private set
    var inventory = Resources()
        private set
    var standings: List<ScoreRow> = emptyList()
        private set
    var rates = RatesReport()
        private set
    /** What happened while this player was away, shown once on reconnect. */
    var awayReport: List<LedgerEntry>? = null

    /** Server said the hero was somewhere else (it outran its movement budget). */
    var positionCorrection: XY? = null

    // --- The combat feed and effects, newest last ---
    data class FeedItem(val id: String, val time: Long, val message: String, val x: Double, val y: Double, val lost: Boolean)
    data class Shot(val fromX: Double, val fromY: Double, val toX: Double, val toY: Double, val damage: Double, val time: Long)
    data class Heal(val x: Double, val y: Double, val radius: Double, val time: Long)

    val feed = ArrayDeque<FeedItem>()
    val shots = ArrayDeque<Shot>()
    val heals = ArrayDeque<Heal>()

    /** Resource amounts when first seen, for drawing how depleted a node is. */
    val resourceMax = HashMap<String, Double>()

    /** Chunks already asked for since the last init. */
    private val requestedChunks = HashSet<String>()

    val me: Player? get() = players[myId]
    val myBase: Building? get() = buildings.values.firstOrNull { it.ownerId == myId && it.type == "base" }
    val myWorkers: List<Worker> get() = workers.values.filter { it.ownerId == myId }

    /** Applies one server event. Returns false for events this client doesn't use. */
    fun apply(event: String, json: String, now: Long = System.currentTimeMillis()): Boolean {
        when (event) {
            "init" -> {
                val init = GameJson.decodeFromString(InitPayload.serializer(), json)
                players.clear(); players.putAll(init.players)
                buildings.clear(); buildings.putAll(init.buildings)
                workers.clear(); workers.putAll(init.units)
                // A reconnect (after the app slept) starts over: resources come per chunk, so ask again
                resources.clear(); resources.putAll(init.resources)
                zones.clear(); zones.putAll(init.zones)
                resourceMax.clear()
                requestedChunks.clear()
                init.resources.values.forEach { resourceMax.putIfAbsent(it.id, it.amount) }
                me?.let { inventory = it.inventory }
                initialized = true
            }
            "chunk_data" -> {
                val chunk = GameJson.decodeFromString(ChunkPayload.serializer(), json)
                resources.putAll(chunk.resources)
                zones.putAll(chunk.zones)
                chunk.resources.values.forEach { resourceMax.putIfAbsent(it.id, it.amount) }
            }
            "player_joined" -> {
                val p = GameJson.decodeFromString(Player.serializer(), json)
                players[p.id] = p
            }
            "player_updated" -> {
                val p = GameJson.decodeFromString(Player.serializer(), json)
                val prev = players[p.id]
                if (p.id == myId) {
                    // Keep the locally predicted position; corrections arrive separately
                    if (prev != null) { p.x = prev.x; p.y = prev.y }
                    players[p.id] = p
                } else {
                    // Rivals arrive without a position when out of sight; keep the last one
                    if (p.hidden && prev != null) { p.x = prev.x; p.y = prev.y }
                    players[p.id] = p
                }
            }
            "player_left" -> players.remove(decodeString(json))
            "position_corrected" -> {
                val pos = GameJson.decodeFromString(XY.serializer(), json)
                me?.let { it.x = pos.x; it.y = pos.y }
                positionCorrection = pos
            }
            "vision" -> {
                val v = GameJson.decodeFromString(VisionPayload.serializer(), json)
                v.buildings.forEach { buildings[it.id] = it }
                v.removedBuildings.forEach { buildings.remove(it) }
                v.units.forEach { workers[it.id] = it }
                v.removedUnits.forEach { workers.remove(it) }
                v.players.forEach { p -> p.hidden = false; players[p.id] = p }
                v.hiddenPlayers.forEach { players[it]?.hidden = true }
            }
            "state_tick" -> {
                val tick = GameJson.decodeFromString(StateTick.serializer(), json)
                for (pos in tick.players) {
                    if (pos.id == myId) continue // the client moves its own hero
                    players[pos.id]?.let { it.x = pos.x; it.y = pos.y; it.hidden = false }
                }
                for (t in tick.units) {
                    val w = workers[t.id] ?: continue
                    w.x = t.x; w.y = t.y; w.state = t.state; w.targetId = t.targetId
                    t.inventory?.let { w.inventory = it }
                    t.capacity?.let { w.capacity = it }
                    w.stall = t.stall
                }
            }
            "building_created", "building_updated" -> {
                val b = GameJson.decodeFromString(Building.serializer(), json)
                buildings[b.id] = b
            }
            "building_destroyed" -> buildings.remove(decodeString(json))
            "unit_created", "unit_updated" -> {
                val w = GameJson.decodeFromString(Worker.serializer(), json)
                workers[w.id] = w
            }
            "resource_updated" -> {
                val r = GameJson.decodeFromString(ResourceNode.serializer(), json)
                resources[r.id] = r
                resourceMax.putIfAbsent(r.id, r.amount)
            }
            "resource_depleted" -> {
                val id = decodeString(json)
                resources.remove(id)
                resourceMax.remove(id)
            }
            "inventory_updated" -> inventory = GameJson.decodeFromString(Resources.serializer(), json)
            "scoreboard" -> standings = GameJson.decodeFromString(ListSerializer(ScoreRow.serializer()), json)
            "rates" -> rates = GameJson.decodeFromString(RatesReport.serializer(), json)
            "combat_events" -> {
                val events = GameJson.decodeFromString(ListSerializer(CombatEvent.serializer()), json)
                for (ev in events) {
                    shots.addLast(Shot(ev.from.x, ev.from.y, ev.to.x, ev.to.y, ev.damage, now))
                    combatMessage(ev)?.let { (msg, lost) ->
                        pushFeed(FeedItem("${now}-${ev.to.id}-${feed.size}", now, msg, ev.to.x, ev.to.y, lost))
                    }
                }
            }
            "healing_events" -> GameJson.decodeFromString(ListSerializer(HealingEvent.serializer()), json)
                .forEach { heals.addLast(Heal(it.x, it.y, it.radius, now)) }
            "ledger_history" -> {
                val h = GameJson.decodeFromString(LedgerHistory.serializer(), json)
                val lastSeen = h.lastSeen
                if (lastSeen != null) {
                    val missed = h.entries.filter { it.time > lastSeen }
                    if (missed.isNotEmpty()) awayReport = missed
                }
            }
            "ledger_entry" -> {
                val e = GameJson.decodeFromString(LedgerEntry.serializer(), json)
                pushFeed(FeedItem(e.id, e.time, e.text, e.x, e.y, e.kind == "lost"))
            }
            else -> return false
        }
        return true
    }

    // The feed is a receipt for this player's fights only; everyone else's are drawn on the map
    private fun combatMessage(ev: CombatEvent): Pair<String, Boolean>? {
        val shooter = buildings[ev.from.id]
        val target = buildings[ev.to.id] ?: return null
        val gun = if (shooter?.type == "turret") "turret" else "guard tower"
        val dmg = ev.damage.toInt()
        return when {
            target.ownerId == myId -> {
                val by = if (shooter != null) "${nameOf(shooter.ownerId)}'s $gun" else "An unseen turret"
                "$by hit your ${target.type} (-$dmg)" to true
            }
            shooter?.ownerId == myId -> "Your $gun hit ${nameOf(target.ownerId)}'s ${target.type} (-$dmg)" to false
            else -> null
        }
    }

    private fun pushFeed(item: FeedItem) {
        feed.addLast(item)
        while (feed.size > 10) feed.removeFirst()
    }

    /** Drops effects and feed lines older than their lifetimes. */
    fun expire(now: Long) {
        while (shots.isNotEmpty() && now - shots.first().time > 800) shots.removeFirst()
        while (heals.isNotEmpty() && now - heals.first().time > 1000) heals.removeFirst()
        while (feed.isNotEmpty() && now - feed.first().time > 10_000) feed.removeFirst()
    }

    fun nameOf(id: String?): String = id?.let { players[it]?.name } ?: "Unknown"

    // --- Map chunks: resources and zones are sent per chunk, on request ---

    /** Chunk keys around the camera and the hero that haven't been requested yet (and marks them requested). */
    fun chunksToRequest(cameraX: Double, cameraY: Double, viewRadius: Double): List<String> {
        val size = config.c("CHUNK_SIZE")
        val keys = LinkedHashSet<String>()
        fun around(x: Double, y: Double, r: Double) {
            val minCx = floor((x - r) / size).toInt()
            val maxCx = floor((x + r) / size).toInt()
            val minCy = floor((y - r) / size).toInt()
            val maxCy = floor((y + r) / size).toInt()
            for (cx in minCx..maxCx) for (cy in minCy..maxCy) keys += "$cx,$cy"
        }
        around(cameraX, cameraY, viewRadius)
        me?.let { around(it.x, it.y, size) }
        return keys.filter { requestedChunks.add(it) }
    }

    private fun decodeString(json: String): String = GameJson.decodeFromString(String.serializer(), json)
}
