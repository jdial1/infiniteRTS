package io.github.jdial1.infiniterts

import io.github.jdial1.infiniterts.game.ConnectionLog
import io.github.jdial1.infiniterts.game.ConnectionLog.Level
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.UnknownHostException

class ConnectionLogTest {
    @Test fun stampsAreRelativeToTheAttempt() {
        val log = ConnectionLog()
        log.startAttempt(10_000)
        val e = log.add(Level.INFO, "Connecting", 11_500)
        assertEquals("+  1.5s", log.stamp(e))
        assertTrue(log.text().contains("INFO  Connecting"))
    }

    @Test fun aRepeatingLineIsKeptOnce() {
        val log = ConnectionLog()
        log.add(Level.WARN, "Couldn't connect: timeout", 1_000)
        log.add(Level.WARN, "Couldn't connect: timeout", 1_500)
        log.add(Level.WARN, "Couldn't connect: timeout", 5_000) // later: worth showing again
        assertEquals(2, log.all.size)
    }

    @Test fun theLogIsBounded() {
        val log = ConnectionLog(limit = 3)
        (1..5).forEach { log.add(Level.INFO, "line $it", it * 10_000L) }
        assertEquals(listOf("line 3", "line 4", "line 5"), log.all.map { it.message })
    }

    @Test fun describeFollowsTheCauseChain() {
        val e = RuntimeException("xhr poll error", UnknownHostException("infinite-rts-server.run.app"))
        assertEquals(
            "RuntimeException: xhr poll error <- UnknownHostException: infinite-rts-server.run.app",
            ConnectionLog.describe(e),
        )
    }
}
