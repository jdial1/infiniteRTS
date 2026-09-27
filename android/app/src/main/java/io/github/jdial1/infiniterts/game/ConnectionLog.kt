package io.github.jdial1.infiniterts.game

/**
 * What happened while connecting, step by step: shown on the menu while the app connects,
 * copyable for a bug report, and mirrored to logcat under the tag "InfiniteRTS".
 */
class ConnectionLog(private val limit: Int = 300) {
    enum class Level { INFO, WARN, ERROR }

    data class Entry(val time: Long, val level: Level, val message: String)

    private val entries = ArrayDeque<Entry>()
    /** When the current connection attempt began; entries show time relative to it. */
    var attemptStartedAt: Long = 0L
        private set

    val all: List<Entry> get() = entries.toList()

    fun startAttempt(now: Long) {
        attemptStartedAt = now
    }

    fun add(level: Level, message: String, now: Long): Entry {
        // A reconnect loop repeats itself; don't let one repeated line push everything else out
        val last = entries.lastOrNull()
        if (last != null && last.level == level && last.message == message && now - last.time < 2_000) return last
        val entry = Entry(now, level, message)
        entries.addLast(entry)
        while (entries.size > limit) entries.removeFirst()
        return entry
    }

    fun clear() = entries.clear()

    /** "+1.2s" relative to the start of the current attempt (or absolute order before one). */
    fun stamp(entry: Entry): String {
        val ms = entry.time - attemptStartedAt
        return if (attemptStartedAt == 0L || ms < 0) "      " else String.format(java.util.Locale.US, "+%5.1fs", ms / 1000.0)
    }

    /** Plain text for sharing: one line per entry. */
    fun text(): String = entries.joinToString("\n") { "${stamp(it)} ${it.level.name.padEnd(5)} ${it.message}" }

    companion object {
        /** A throwable as one line, with its causes: the root cause is usually the useful part. */
        fun describe(t: Throwable?): String {
            if (t == null) return "unknown error"
            val parts = mutableListOf<String>()
            var cur: Throwable? = t
            var depth = 0
            while (cur != null && depth < 4) {
                parts += "${cur.javaClass.simpleName}: ${cur.message ?: "(no message)"}"
                cur = cur.cause.takeIf { it !== cur }
                depth++
            }
            return parts.joinToString(" <- ")
        }
    }
}
