package io.github.jdial1.infiniterts.rules

import io.github.jdial1.infiniterts.model.Building
import io.github.jdial1.infiniterts.model.GameConfig
import kotlin.math.abs
import kotlin.math.hypot

// Where a player may build and mine, as the server decides it (src/utils/geometry.ts):
// the base's radius, each outpost's radius, a bridge between neighbouring outposts, and the
// interior of any square of four. Also the vision circles the server uses for fog.
object Territory {
    const val OUTPOST_BUILD_RADIUS = 400.0
    const val OUTPOST_SPACING = 600.0
    private const val BRIDGE_HALF_WIDTH = 200.0
    private const val OUTPOST_VISION = 450.0

    sealed interface Shape {
        data class Circle(val x: Double, val y: Double, val r: Double) : Shape
        data class Rect(val left: Double, val top: Double, val right: Double, val bottom: Double) : Shape
    }

    private fun adjacent(a: Building, b: Building): Boolean {
        val dx = abs(a.x - b.x)
        val dy = abs(a.y - b.y)
        return (abs(dx - OUTPOST_SPACING) < 1 && dy < 1) || (dx < 1 && abs(dy - OUTPOST_SPACING) < 1)
    }

    fun shapes(config: GameConfig, playerId: String, buildings: Collection<Building>): List<Shape> {
        val out = mutableListOf<Shape>()
        buildings.firstOrNull { it.ownerId == playerId && it.type == "base" }?.let {
            out += Shape.Circle(it.x, it.y, config.c("BUILD_RANGE"))
        }
        val outposts = buildings.filter { it.ownerId == playerId && it.type == "outpost" }
        outposts.forEach { out += Shape.Circle(it.x, it.y, OUTPOST_BUILD_RADIUS) }
        for (i in outposts.indices) for (j in i + 1 until outposts.size) {
            val a = outposts[i]
            val b = outposts[j]
            if (!adjacent(a, b)) continue
            out += if (abs(a.x - b.x) > abs(a.y - b.y)) {
                Shape.Rect(minOf(a.x, b.x), a.y - BRIDGE_HALF_WIDTH, maxOf(a.x, b.x), a.y + BRIDGE_HALF_WIDTH)
            } else {
                Shape.Rect(a.x - BRIDGE_HALF_WIDTH, minOf(a.y, b.y), a.x + BRIDGE_HALF_WIDTH, maxOf(a.y, b.y))
            }
        }
        for (o in outposts) {
            fun has(dx: Double, dy: Double) = outposts.any { abs(it.x - (o.x + dx)) < 1 && abs(it.y - (o.y + dy)) < 1 }
            if (has(OUTPOST_SPACING, 0.0) && has(0.0, OUTPOST_SPACING) && has(OUTPOST_SPACING, OUTPOST_SPACING)) {
                out += Shape.Rect(o.x, o.y, o.x + OUTPOST_SPACING, o.y + OUTPOST_SPACING)
            }
        }
        return out
    }

    fun contains(shapes: List<Shape>, x: Double, y: Double): Boolean = shapes.any {
        when (it) {
            is Shape.Circle -> hypot(x - it.x, y - it.y) <= it.r
            is Shape.Rect -> x >= it.left && x <= it.right && y >= it.top && y <= it.bottom
        }
    }

    fun isPointInTerritory(config: GameConfig, playerId: String, buildings: Collection<Building>, x: Double, y: Double) =
        contains(shapes(config, playerId, buildings), x, y)

    data class Vision(val x: Double, val y: Double, val r: Double)

    // The same circles the server uses to decide what this player is sent
    fun visionCircles(
        config: GameConfig,
        playerId: String,
        heroX: Double?,
        heroY: Double?,
        buildings: Collection<Building>,
        workers: Collection<Pair<Double, Double>>,
    ): List<Vision> {
        val out = mutableListOf<Vision>()
        if (heroX != null && heroY != null) out += Vision(heroX, heroY, config.c("FOG_VISION_HERO"))
        for (b in buildings) {
            if (b.ownerId != playerId) continue
            out += Vision(
                b.x, b.y,
                when (b.type) {
                    "base" -> config.c("FOG_VISION_BASE")
                    "turret" -> config.c("FOG_VISION_TURRET")
                    "outpost" -> OUTPOST_VISION
                    else -> 200.0
                },
            )
        }
        workers.forEach { (x, y) -> out += Vision(x, y, config.c("FOG_VISION_MINER")) }
        return out
    }
}
