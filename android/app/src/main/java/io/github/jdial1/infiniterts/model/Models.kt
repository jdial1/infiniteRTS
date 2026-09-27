package io.github.jdial1.infiniterts.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

// The server's wire format (src/types.ts on the server). Numbers the server may send as
// fractions are Doubles; counts and levels are Ints.

val GameJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    encodeDefaults = true
}

@Serializable
data class Resources(val wood: Double = 0.0, val stone: Double = 0.0, val gold: Double = 0.0) {
    operator fun get(type: String): Double = when (type) {
        "wood" -> wood
        "stone" -> stone
        "gold" -> gold
        else -> 0.0
    }

    fun covers(cost: Resources) = wood >= cost.wood && stone >= cost.stone && gold >= cost.gold

    companion object {
        val TYPES = listOf("wood", "stone", "gold")
    }
}

@Serializable
data class LaborRatio(val wood: Int = 1, val stone: Int = 1, val gold: Int = 1) {
    operator fun get(type: String): Int = when (type) {
        "wood" -> wood
        "stone" -> stone
        "gold" -> gold
        else -> 0
    }

    fun with(type: String, value: Int): LaborRatio = when (type) {
        "wood" -> copy(wood = value)
        "stone" -> copy(stone = value)
        "gold" -> copy(gold = value)
        else -> this
    }
}

@Serializable
data class PlanProgress(val phase: Int = 0, val delivered: Resources = Resources())

@Serializable
data class Player(
    val id: String,
    val name: String = "",
    var x: Double = 0.0,
    var y: Double = 0.0,
    val color: String = "#ffffff",
    val inventory: Resources = Resources(),
    val traits: List<String> = emptyList(),
    val upgrades: Map<String, Int> = emptyMap(),
    val plan: PlanProgress? = null,
    val laborRatio: LaborRatio? = null,
    // A rival outside this client's vision: known by name, not by position
    var hidden: Boolean = false,
) {
    fun level(upgradeId: String) = upgrades[upgradeId] ?: 0
}

@Serializable
data class Building(
    val id: String,
    val ownerId: String,
    val type: String,
    val x: Double,
    val y: Double,
    val health: Double = 0.0,
    val captureProgress: Double? = null,
    val capturingPlayerId: String? = null,
    val isConflict: Boolean? = null,
    val subType: String? = null,
    val paid: Resources? = null,
    val maxHealth: Double? = null,
)

@Serializable
data class Cargo(val type: String? = null, val amount: Double = 0.0)

// A worker. (The server calls it a unit; that name is taken in Kotlin.)
@Serializable
data class Worker(
    val id: String,
    val ownerId: String,
    val type: String = "miner",
    var x: Double = 0.0,
    var y: Double = 0.0,
    var state: String = "idle",
    var targetId: String? = null,
    var inventory: Cargo = Cargo(),
    var capacity: Double = 20.0,
    val assignedResource: String? = null,
    var stall: String? = null,
)

@Serializable
data class ResourceNode(val id: String, val type: String, val x: Double, val y: Double, val amount: Double)

@Serializable
data class MapZone(val id: String, val x: Double, val y: Double, val radius: Double, val type: String, val name: String = "")

@Serializable
data class LedgerEntry(val id: String, val time: Long, val kind: String, val text: String, val x: Double, val y: Double)

@Serializable
data class ScoreRow(
    val id: String,
    val name: String = "",
    val color: String = "#ffffff",
    val traits: List<String> = emptyList(),
    val score: Double = 0.0,
    val outposts: Int = 0,
    val planPhase: Int = 0,
    val online: Boolean = false,
)

@Serializable
data class DepotRate(
    val id: String,
    val label: String,
    val x: Double,
    val y: Double,
    val wood: Double = 0.0,
    val stone: Double = 0.0,
    val gold: Double = 0.0,
)

@Serializable
data class RatesReport(val perMinute: Resources = Resources(), val depots: List<DepotRate> = emptyList())

// --- Event payloads ---

@Serializable
data class InitPayload(
    val players: Map<String, Player> = emptyMap(),
    val buildings: Map<String, Building> = emptyMap(),
    val units: Map<String, Worker> = emptyMap(),
    val zones: Map<String, MapZone> = emptyMap(),
    val resources: Map<String, ResourceNode> = emptyMap(),
)

@Serializable
data class ChunkPayload(
    val resources: Map<String, ResourceNode> = emptyMap(),
    val zones: Map<String, MapZone> = emptyMap(),
)

@Serializable
data class Position(val id: String, val x: Double, val y: Double)

@Serializable
data class UnitTick(
    val id: String,
    val x: Double,
    val y: Double,
    val state: String = "idle",
    val targetId: String? = null,
    val inventory: Cargo? = null,
    val capacity: Double? = null,
    val stall: String? = null,
)

@Serializable
data class StateTick(val players: List<Position> = emptyList(), val units: List<UnitTick> = emptyList())

@Serializable
data class VisionPayload(
    val buildings: List<Building> = emptyList(),
    val removedBuildings: List<String> = emptyList(),
    val units: List<Worker> = emptyList(),
    val removedUnits: List<String> = emptyList(),
    val players: List<Player> = emptyList(),
    val hiddenPlayers: List<String> = emptyList(),
)

@Serializable
data class Point(val x: Double, val y: Double, val id: String = "")

@Serializable
data class CombatEvent(val from: Point, val to: Point, val damage: Double)

@Serializable
data class HealingEvent(val x: Double, val y: Double, val radius: Double)

@Serializable
data class LedgerHistory(val entries: List<LedgerEntry> = emptyList(), val lastSeen: Long? = null)

@Serializable
data class XY(val x: Double, val y: Double)

/** The server's own startup record and health, sent first on every connection (server/status.ts). */
@Serializable
data class StartupStep(val step: String, val atMs: Long = 0, val detail: String? = null)

@Serializable
data class ServerStatus(
    val phase: String = "",
    val revision: String = "",
    val bootedAt: String = "",
    val uptimeMs: Long = 0,
    val coldStart: Boolean = false,
    val auth: String? = null,
    val worldStore: String? = null,
    val worldLoadMs: Long? = null,
    val playersOnline: Int = 0,
    val players: Int = 0,
    val buildings: Int = 0,
    val startup: List<StartupStep> = emptyList(),
)
