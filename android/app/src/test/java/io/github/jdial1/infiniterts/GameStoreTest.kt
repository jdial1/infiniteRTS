package io.github.jdial1.infiniterts

import io.github.jdial1.infiniterts.game.GameStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Payloads shaped exactly as server.ts sends them
class GameStoreTest {
    private fun store() = GameStore(TestData.config, "me").apply {
        apply("init", """{"players":{"me":{"id":"me","name":"Player me","x":10,"y":20,"color":"hsl(10, 80%, 60%)","inventory":{"wood":300,"stone":200,"gold":100},"score":0,"traits":[],"upgrades":{},"plan":{"phase":0,"delivered":{"wood":0,"stone":0,"gold":0}},"laborRatio":{"wood":1,"stone":1,"gold":1}},
          "rival":{"id":"rival","name":"Player riv","color":"#f00","traits":["speed","cost"],"x":0,"y":0,"hidden":true,"inventory":{"wood":0,"stone":0,"gold":0},"score":0,"upgrades":{}}},
          "buildings":{"outpost-600-0":{"id":"outpost-600-0","ownerId":"neutral","type":"outpost","x":600,"y":0,"health":500,"captureProgress":0,"capturingPlayerId":null,"isConflict":false}},
          "units":{},"zones":{},"resources":{}}""")
    }

    @Test fun initLoadsMeAndHidesRivals() {
        val s = store()
        assertTrue(s.initialized)
        assertEquals(300.0, s.inventory.wood, 0.0)
        assertTrue(s.players.getValue("rival").hidden)
        assertEquals(1, s.buildings.size)
    }

    @Test fun ownPositionIsPredictedLocallyNotOverwrittenByTicks() {
        val s = store()
        s.me!!.x = 55.0
        s.apply("state_tick", """{"players":[{"id":"me","x":0,"y":0},{"id":"rival","x":7,"y":8}],"units":[]}""")
        assertEquals(55.0, s.me!!.x, 0.0)
        assertEquals(7.0, s.players.getValue("rival").x, 0.0)
        s.apply("position_corrected", """{"x":1,"y":2}""")
        assertEquals(1.0, s.me!!.x, 0.0)
        assertNotNull(s.positionCorrection)
    }

    @Test fun visionAddsAndRemovesRivalState() {
        val s = store()
        s.apply("vision", """{"buildings":[{"id":"b1","ownerId":"rival","type":"turret","x":5,"y":5,"health":100}],"removedBuildings":[],
            "units":[{"id":"u1","ownerId":"rival","type":"miner","x":1,"y":1,"state":"idle","inventory":{"type":null,"amount":0},"capacity":20,"assignedResource":"wood"}],
            "removedUnits":[],"players":[{"id":"rival","name":"Player riv","color":"#f00","traits":[],"x":3,"y":4,"hidden":false}],"hiddenPlayers":[]}""")
        assertTrue("b1" in s.buildings)
        assertTrue("u1" in s.workers)
        assertFalse(s.players.getValue("rival").hidden)
        s.apply("vision", """{"buildings":[],"removedBuildings":["b1"],"units":[],"removedUnits":["u1"],"players":[],"hiddenPlayers":["rival"]}""")
        assertFalse("b1" in s.buildings)
        assertFalse("u1" in s.workers)
        assertTrue(s.players.getValue("rival").hidden)
    }

    @Test fun combatFeedNamesOnlyMyFights() {
        val s = store()
        s.apply("building_created", """{"id":"wall","ownerId":"me","type":"wall","x":0,"y":0,"health":90}""")
        s.apply("vision", """{"buildings":[{"id":"t","ownerId":"rival","type":"turret","x":100,"y":0,"health":100}]}""")
        s.apply("combat_events", """[{"from":{"x":100,"y":0,"id":"t"},"to":{"x":0,"y":0,"id":"wall"},"damage":10}]""", now = 1000)
        assertEquals("Player riv's turret hit your wall (-10)", s.feed.last().message)
        assertTrue(s.feed.last().lost)
        s.expire(12_000)
        assertTrue(s.feed.isEmpty())
    }

    @Test fun awayReportShowsOnlyWhatHappenedSinceLastSeen() {
        val s = store()
        s.apply("ledger_history", """{"entries":[{"id":"a","time":100,"kind":"lost","text":"old","x":0,"y":0},{"id":"b","time":300,"kind":"lost","text":"new","x":0,"y":0}],"lastSeen":200}""")
        assertEquals(listOf("new"), s.awayReport!!.map { it.text })
        val fresh = store()
        fresh.apply("ledger_history", """{"entries":[],"lastSeen":null}""")
        assertNull(fresh.awayReport)
    }

    @Test fun stringPayloadsAndStandings() {
        val s = store()
        s.apply("building_destroyed", "\"outpost-600-0\"")
        assertTrue(s.buildings.isEmpty())
        s.apply("scoreboard", """[{"id":"me","name":"Player me","color":"#fff","traits":[],"score":250,"outposts":1,"planPhase":1,"online":true}]""")
        assertEquals(250.0, s.standings.single().score, 0.0)
        assertFalse(s.apply("some_future_event", "{}"))
    }

    @Test fun chunksAreRequestedOnce() {
        val s = store()
        val first = s.chunksToRequest(0.0, 0.0, 500.0)
        assertTrue(first.contains("0,0") && first.contains("-1,-1"))
        assertTrue(s.chunksToRequest(0.0, 0.0, 500.0).isEmpty())
    }
}
