package io.github.jdial1.infiniterts.net

import io.github.jdial1.infiniterts.game.ConnectionLog
import io.github.jdial1.infiniterts.game.ConnectionLog.Level
import io.socket.client.IO
import io.socket.client.Manager
import io.socket.client.Socket
import io.socket.engineio.client.Transport
import org.json.JSONArray
import org.json.JSONObject

/**
 * The socket to the game server. Every connection proves who it is: `auth.token` carries a
 * Firebase ID token the server verifies (or, against a local dev server, `auth.userId` alone).
 * Events arrive on the socket's own thread as (name, JSON text); callers hop to their own thread.
 */
class GameConnection(
    private val url: String,
    private val listener: Listener,
) {
    interface Listener {
        fun onEvent(event: String, json: String)
        fun onConnectionChanged(connected: Boolean)
        /** The server refused this connection's credentials (an expired or invalid token). */
        fun onUnauthorized()
        /** A step of the connection, for the connection log. */
        fun onLog(level: Level, message: String) {}
    }

    private var socket: Socket? = null

    fun connect(userId: String, token: String?) {
        disconnect()
        val auth = buildMap {
            put("userId", userId)
            if (token != null) put("token", token)
        }
        val options = IO.Options.builder()
            .setPath("/socket.io")
            .setAuth(auth)
            .setReconnection(true)
            .build()
        listener.onLog(Level.INFO, "Connecting to $url (${if (token != null) "with a Firebase ID token" else "as a guest"})")
        val s = IO.socket(url, options)
        val manager = s.io()
        // The transport underneath: reaching the server at all, and how
        manager.on(Manager.EVENT_TRANSPORT) { args ->
            (args.firstOrNull() as? Transport)?.let { listener.onLog(Level.INFO, "Transport: ${it.name}") }
        }
        manager.on(Manager.EVENT_OPEN) { listener.onLog(Level.INFO, "Server reached (engine handshake complete)") }
        manager.on(Manager.EVENT_ERROR) { args ->
            listener.onLog(Level.WARN, "Transport error: ${describe(args.firstOrNull())}")
        }
        manager.on(Manager.EVENT_CLOSE) { args ->
            listener.onLog(Level.WARN, "Transport closed: ${args.firstOrNull() ?: "no reason given"}")
        }
        manager.on(Manager.EVENT_RECONNECT_ATTEMPT) { args ->
            listener.onLog(Level.INFO, "Retrying (attempt ${args.firstOrNull() ?: "?"})")
        }
        manager.on(Manager.EVENT_RECONNECT_FAILED) { listener.onLog(Level.ERROR, "Gave up reconnecting") }

        s.on(Socket.EVENT_CONNECT) {
            listener.onLog(Level.INFO, "Connected (socket ${s.id()}); waiting for the world")
            listener.onConnectionChanged(true)
        }
        s.on(Socket.EVENT_DISCONNECT) { args ->
            listener.onLog(Level.WARN, "Disconnected: ${args.firstOrNull() ?: "no reason given"}")
            listener.onConnectionChanged(false)
        }
        s.on(Socket.EVENT_CONNECT_ERROR) { args ->
            listener.onConnectionChanged(false)
            val a = args.firstOrNull()
            val message = when (a) {
                is JSONObject -> a.optString("message")
                is Throwable -> a.message
                else -> a?.toString()
            }
            if (message == "unauthorized") {
                val reason = (a as? JSONObject)?.optJSONObject("data")?.optString("reason")?.takeIf { it.isNotBlank() }
                listener.onLog(Level.ERROR, "Server refused the connection: ${reason ?: "unauthorized"}")
                // Reconnecting with the same stale token would fail forever; let the caller fetch a new one
                s.io().reconnection(false)
                listener.onUnauthorized()
            } else {
                listener.onLog(Level.WARN, "Couldn't connect: ${describe(a)}")
            }
        }
        for (event in SERVER_EVENTS) {
            s.on(event) { args -> listener.onEvent(event, toJson(args.firstOrNull())) }
        }
        socket = s
        s.connect()
    }

    fun disconnect() {
        socket?.let {
            it.off()
            it.disconnect()
            it.close()
        }
        socket = null
    }

    val isConnected: Boolean get() = socket?.connected() == true

    // --- Commands (the server's socket handlers) ---
    fun selectTraits(traits: List<String>) = emit("select_traits", JSONArray(traits))
    fun requestChunks(keys: List<String>) = emit("request_chunks", JSONArray(keys))
    fun move(x: Double, y: Double) = emit("move", JSONObject().put("x", x).put("y", y))
    fun build(type: String, x: Double, y: Double) = emit("build", JSONObject().put("type", type).put("x", x).put("y", y))
    fun trainWorker() = emit("train_unit", JSONObject().put("type", "miner"))
    fun purchaseUpgrade(id: String) = emit("purchase_upgrade", JSONObject().put("upgradeId", id))
    fun assignWorker(resource: String, delta: Int) =
        emit("assign_miner", JSONObject().put("resource", resource).put("delta", delta))
    fun setLaborRatio(wood: Int, stone: Int, gold: Int) =
        emit("set_labor_ratio", JSONObject().put("wood", wood).put("stone", stone).put("gold", gold))
    fun clearLaborRatio() = emit("set_labor_ratio", JSONObject.NULL)
    fun deliverToPlan() { socket?.emit("plan_deliver") }
    fun demolish(buildingId: String) = emit("demolish", buildingId)
    fun gather(resourceId: String) = emit("gather", resourceId)

    private fun emit(event: String, arg: Any) {
        socket?.emit(event, arg)
    }

    private fun describe(value: Any?): String = when (value) {
        is Throwable -> ConnectionLog.describe(value)
        is JSONObject -> value.optString("message", value.toString())
        null -> "no details"
        else -> value.toString()
    }

    companion object {
        val SERVER_EVENTS = listOf(
            "server_status", "init", "chunk_data", "player_joined", "player_updated", "player_left", "position_corrected",
            "vision", "state_tick", "building_created", "building_updated", "building_destroyed",
            "unit_created", "unit_updated", "resource_updated", "resource_depleted", "inventory_updated",
            "scoreboard", "rates", "combat_events", "healing_events", "ledger_history", "ledger_entry",
        )

        /** Socket.IO hands over org.json values; the store reads JSON text. */
        fun toJson(value: Any?): String = when (value) {
            null, JSONObject.NULL -> "null"
            is JSONObject, is JSONArray -> value.toString()
            is String -> JSONObject.quote(value)
            else -> value.toString()
        }
    }
}
