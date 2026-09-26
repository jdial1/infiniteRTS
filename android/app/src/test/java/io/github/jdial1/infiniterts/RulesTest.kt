package io.github.jdial1.infiniterts

import io.github.jdial1.infiniterts.model.Building
import io.github.jdial1.infiniterts.model.LaborRatio
import io.github.jdial1.infiniterts.model.Player
import io.github.jdial1.infiniterts.model.Resources
import io.github.jdial1.infiniterts.rules.Rules
import io.github.jdial1.infiniterts.rules.Territory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Expected values are the server's (src/rules.ts, server.ts) for the same inputs
class RulesTest {
    private val config = TestData.config
    private val plain = Player(id = "p")

    @Test fun planPhasesGrowBy135AndRoundLikeJavaScript() {
        assertEquals(Resources(300.0, 300.0, 100.0), Rules.planRequirement(0))
        assertEquals(Resources(405.0, 405.0, 135.0), Rules.planRequirement(1))
        assertEquals(Resources(547.0, 547.0, 182.0), Rules.planRequirement(2)) // 546.75 -> 547, 182.25 -> 182
    }

    @Test fun planInstalmentIsAQuarterRoundedUp() {
        assertEquals(Resources(75.0, 75.0, 25.0), Rules.planInstalment(0))
        assertEquals(Resources(102.0, 102.0, 34.0), Rules.planInstalment(1)) // 101.25, 33.75
    }

    @Test fun buildCostsApplyTraitAndDiscount() {
        assertEquals(Resources(100.0, 100.0, 50.0), Rules.buildCost(config, "base", plain))
        val logistics = Player(id = "p", traits = listOf("cost", "speed"), upgrades = mapOf("base_construction" to 10))
        // 100 * 0.75 * 0.9 = 67.5 -> 67
        assertEquals(Resources(67.0, 67.0, 33.0), Rules.buildCost(config, "base", logistics))
    }

    @Test fun workersDoubleInPriceEveryTen() {
        assertEquals(Resources(50.0, 20.0, 0.0), Rules.workerCost(config, plain, 9))
        assertEquals(Resources(100.0, 40.0, 0.0), Rules.workerCost(config, plain, 10))
    }

    @Test fun upgradeCostsGrow15xAndExpansion4x() {
        val speed = config.upgrades.first { it.id == "miner_speed" }
        assertEquals(Resources(150.0, 120.0, 60.0), Rules.upgradeCost(speed, 1))
        val expansion = config.upgrades.first { it.id == "base_expansion" }
        assertEquals(Resources(4000.0, 4000.0, 4000.0), Rules.upgradeCost(expansion, 1))
        val depot = config.upgrades.first { it.id == "turret_depot" }
        assertTrue(Rules.isMaxed(depot, 1))
    }

    @Test fun demolishRefundsWhatWasPaidScaledByHealth() {
        val wall = Building("w", "p", "wall", 0.0, 0.0, health = 100.0, paid = Resources(0.0, 10.0, 0.0), maxHealth = 100.0)
        assertEquals(Resources(0.0, 10.0, 0.0), Rules.demolishRefund(config, wall))
        assertEquals(Resources(0.0, 5.0, 0.0), Rules.demolishRefund(config, wall.copy(health = 55.0)))
    }

    @Test fun labourSplitMatchesTheServer() {
        assertEquals(mapOf("wood" to 1, "stone" to 1, "gold" to 1), Rules.desiredLabour(3, LaborRatio(1, 1, 1)))
        assertEquals(mapOf("wood" to 3, "stone" to 0, "gold" to 0), Rules.desiredLabour(3, LaborRatio(3, 0, 0)))
        assertEquals(mapOf("wood" to 4, "stone" to 2, "gold" to 1), Rules.desiredLabour(7, LaborRatio(3, 2, 1)))
    }

    @Test fun territoryIncludesBaseOutpostsBridgesAndSquares() {
        val b = listOf(
            Building("base", "p", "base", 0.0, 0.0),
            Building("o1", "p", "outpost", 1200.0, 0.0),
            Building("o2", "p", "outpost", 1800.0, 0.0),
            Building("o3", "p", "outpost", 1200.0, 600.0),
            Building("o4", "p", "outpost", 1800.0, 600.0),
            Building("rival", "q", "outpost", 3000.0, 0.0),
        )
        assertTrue(Territory.isPointInTerritory(config, "p", b, 440.0, 0.0))    // base radius 450
        assertFalse(Territory.isPointInTerritory(config, "p", b, 700.0, 0.0))
        assertTrue(Territory.isPointInTerritory(config, "p", b, 1500.0, 190.0))  // bridge o1-o2
        assertTrue(Territory.isPointInTerritory(config, "p", b, 1500.0, 300.0))  // filled square
        assertFalse(Territory.isPointInTerritory(config, "p", b, 3000.0, 0.0))   // someone else's
    }
}
