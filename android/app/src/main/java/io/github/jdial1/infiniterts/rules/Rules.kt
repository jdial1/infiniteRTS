package io.github.jdial1.infiniterts.rules

import io.github.jdial1.infiniterts.model.Building
import io.github.jdial1.infiniterts.model.GameConfig
import io.github.jdial1.infiniterts.model.LaborRatio
import io.github.jdial1.infiniterts.model.Player
import io.github.jdial1.infiniterts.model.Resources
import io.github.jdial1.infiniterts.model.UpgradeDef
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.pow

// A port of the server's rules (src/rules.ts and the costs in server.ts), so every number
// the app shows is the number the server charges. Math.round matches JavaScript's for positives.

object Rules {
    // --- The Plan: the infinite sink ---
    private val PLAN_BASE = Resources(300.0, 300.0, 100.0)
    private const val PLAN_GROWTH = 1.35

    fun planRequirement(phasesDone: Int): Resources {
        val f = PLAN_GROWTH.pow(phasesDone)
        return Resources(
            Math.round(PLAN_BASE.wood * f).toDouble(),
            Math.round(PLAN_BASE.stone * f).toDouble(),
            Math.round(PLAN_BASE.gold * f).toDouble(),
        )
    }

    // One delivery commits at most a quarter of the phase
    fun planInstalment(phasesDone: Int): Resources {
        val need = planRequirement(phasesDone)
        return Resources(ceil(need.wood / 4), ceil(need.stone / 4), ceil(need.gold / 4))
    }

    // --- Standings: held ground and fulfilled Plan phases only ---
    const val SCORE_PER_OUTPOST = 100
    const val SCORE_PER_PLAN_PHASE = 150

    // --- Costs ---
    private fun discountFactor(p: Player) =
        maxOf(0.4, 1.0 - p.level("base_construction") * 0.01 - p.level("trait_cost_upg") * 0.01)

    private fun traitModifier(p: Player) = if ("cost" in p.traits) 0.75 else 1.0

    fun buildCost(config: GameConfig, type: String, p: Player): Resources {
        val cost = config.def(type)?.cost ?: return Resources()
        val m = traitModifier(p) * discountFactor(p)
        return Resources(floor(cost.wood * m), floor(cost.stone * m), floor(cost.gold * m))
    }

    // Workers double in price every ten
    fun workerCost(config: GameConfig, p: Player, workersOwned: Int): Resources {
        val cost = config.def("miner")?.cost ?: return Resources()
        val m = traitModifier(p) * discountFactor(p) * 2.0.pow(workersOwned / 10)
        return Resources(floor(cost.wood * m), floor(cost.stone * m), floor(cost.gold * m))
    }

    fun upgradeCost(upgrade: UpgradeDef, level: Int): Resources {
        val f = (if (upgrade.id == "base_expansion") 4.0 else 1.5).pow(level)
        return Resources(
            Math.round(upgrade.baseCost.wood * f).toDouble(),
            Math.round(upgrade.baseCost.stone * f).toDouble(),
            Math.round(upgrade.baseCost.gold * f).toDouble(),
        )
    }

    fun isMaxed(upgrade: UpgradeDef, level: Int) = upgrade.maxLevel != null && level >= upgrade.maxLevel

    // What the next level buys, in the same words the server's numbers use
    fun upgradeBonus(config: GameConfig, upgrade: UpgradeDef, level: Int): String {
        val next = level + 1
        return when (upgrade.id) {
            "miner_speed" -> "+${level * 2} → +${next * 2} speed"
            "miner_capacity" -> {
                val cap = (config.def("miner")?.baseCapacity ?: 20.0).toInt()
                "${cap + level} → ${cap + next}"
            }
            "base_depot" -> "+${level * 5}% → +${next * 5}%"
            "trait_speed_upg" -> "+$level% → +$next%"
            "trait_strength_upg" -> "+${level * 2}% → +${next * 2}%"
            "trait_cost_upg" -> "-$level% → -$next%"
            "base_construction" -> "${minOf(60, level)}% → ${minOf(60, next)}%"
            "wall_roads" -> "+${level * 10}% → +${next * 10}%"
            "wall_magnetic" -> "$level% → $next%"
            "turret_depot" -> if (isMaxed(upgrade, level)) "active" else "off → on"
            "turret_beam" -> "+$level → +$next"
            "base_expansion" -> "${(level + 2) * (level + 2)} → ${(level + 3) * (level + 3)} outposts"
            else -> ""
        }
    }

    fun outpostLimit(p: Player): Int {
        val lvl = p.level("base_expansion")
        return (lvl + 2) * (lvl + 2)
    }

    // --- Hero movement: the speed the client moves at. The server clamps anything faster. ---
    fun heroSpeed(config: GameConfig, p: Player, nearOwnWall: Boolean): Double {
        val base = if ("speed" in p.traits) config.c("HERO_SPEED_BOOST") else config.c("HERO_SPEED")
        val magnetic = if (nearOwnWall) 1 + p.level("wall_magnetic") * 0.01 else 1.0
        return base * (1 + p.level("trait_speed_upg") * 0.01) * magnetic
    }

    // --- Demolition: full refund while undamaged, scaled by remaining health otherwise ---
    fun maxHealthOf(config: GameConfig, b: Building): Double = b.maxHealth ?: config.def(b.type)?.health ?: 100.0

    fun demolishRefund(config: GameConfig, b: Building): Resources {
        val paid = b.paid ?: config.def(b.type)?.cost ?: Resources()
        val share = (b.health / maxHealthOf(config, b)).coerceIn(0.0, 1.0)
        return Resources(floor(paid.wood * share), floor(paid.stone * share), floor(paid.gold * share))
    }

    // --- Standing orders: how the server splits workers for a ratio (largest remainder) ---
    fun desiredLabour(total: Int, ratio: LaborRatio): Map<String, Int> {
        val weight = ratio.wood + ratio.stone + ratio.gold
        val out = mutableMapOf("wood" to 0, "stone" to 0, "gold" to 0)
        if (weight <= 0 || total <= 0) return out
        val exact = Resources.TYPES.map { it to total.toDouble() * ratio[it] / weight }
        var assigned = 0
        for ((t, v) in exact) {
            out[t] = floor(v).toInt()
            assigned += out.getValue(t)
        }
        val byRemainder = exact.sortedByDescending { (_, v) -> v - floor(v) }
        var i = 0
        while (assigned < total) {
            val t = byRemainder[i % byRemainder.size].first
            out[t] = out.getValue(t) + 1
            assigned++
            i++
        }
        return out
    }

    // --- Doctrines ---
    data class Mascot(val label: String, val color: Long)

    fun mascotFor(traits: List<String>): Mascot? {
        if (traits.size < 2) return null
        return when {
            "speed" in traits && "strength" in traits -> Mascot("The Iron Jaguar", 0xFFF97316)
            "speed" in traits && "cost" in traits -> Mascot("The Swift Falcon", 0xFF38BDF8)
            "strength" in traits && "cost" in traits -> Mascot("The Great Tusk", 0xFF10B981)
            else -> null
        }
    }
}
