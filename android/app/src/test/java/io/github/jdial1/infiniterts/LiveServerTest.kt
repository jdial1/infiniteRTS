package io.github.jdial1.infiniterts

import io.github.jdial1.infiniterts.game.GameStore
import io.github.jdial1.infiniterts.net.GameConnection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Plays against a real local server in guest mode (no FIREBASE_PROJECT_ID):
 *   npm run dev            (in the repository root)
 *   GAME_SERVER_URL=http://localhost:3000 ./gradlew test
 * Skipped when GAME_SERVER_URL isn't set.
 */
class LiveServerTest {
    @Test fun joinsBuildsAndHearsTheWorld() {
        val url = System.getenv("GAME_SERVER_URL")?.takeIf { it.isNotBlank() }
        assumeTrue("set GAME_SERVER_URL to run against a local server", url != null)
        val userId = "android-test-" + UUID.randomUUID().toString().take(8)
        val store = GameStore(TestData.config, userId)
        val lock = Object()
        val gotInit = CountDownLatch(1)
        val gotBase = CountDownLatch(1)
        val gotTick = CountDownLatch(1)
        val events = java.util.Collections.synchronizedList(mutableListOf<String>())
        val logLines = java.util.Collections.synchronizedList(mutableListOf<String>())
        val connection = GameConnection(url!!, object : GameConnection.Listener {
            override fun onEvent(event: String, json: String) {
                events += event
                synchronized(lock) { store.apply(event, json) }
                when (event) {
                    "init" -> gotInit.countDown()
                    "building_created" -> if (store.myBase != null) gotBase.countDown()
                    "state_tick" -> gotTick.countDown()
                }
            }
            override fun onConnectionChanged(connected: Boolean) {}
            override fun onUnauthorized() {}
            override fun onLog(level: io.github.jdial1.infiniterts.game.ConnectionLog.Level, message: String) {
                logLines += "$level $message"
            }
        })
        connection.connect(userId, token = null)
        try {
            assertTrue("init", gotInit.await(10, TimeUnit.SECONDS))
            assertTrue("state_tick", gotTick.await(5, TimeUnit.SECONDS))
            // The server reports its status before the world, and the connection log saw each step
            assertTrue("server_status before init", events.indexOf("server_status") in 0 until events.indexOf("init"))
            val lines = logLines.toList()
            assertTrue("log: $lines", lines.any { it.contains("Connecting to $url") })
            assertTrue("log: $lines", lines.any { it.contains("Server reached") })
            assertTrue("log: $lines", lines.any { it.contains("Connected (socket") })
            println("Connection log:\n" + lines.joinToString("\n"))
            val me = synchronized(lock) { store.me!! }
            connection.build("base", me.x, me.y)
            assertTrue("base built", gotBase.await(5, TimeUnit.SECONDS))
            connection.requestChunks(synchronized(lock) { store.chunksToRequest(me.x, me.y, 1000.0) })
            Thread.sleep(2500)
            synchronized(lock) {
                assertTrue("resources arrived", store.resources.isNotEmpty())
                assertEquals("base cost was charged", 200.0, store.inventory.wood, 0.0)
                assertTrue("standings arrived", store.standings.any { it.id == userId })
            }
        } finally {
            connection.disconnect()
        }
    }
}
