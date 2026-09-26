package io.github.jdial1.infiniterts.net

import io.socket.client.IO
import io.socket.client.Socket
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
        val s = IO.socket(url, options)
        s.on(Socket.EVENT_CONNECT) { listener.onConnectionChanged(true) }
        s.on(Socket.EVENT_DISCONNECT) { listener.onConnectionChanged(false) }
        s.on(Socket.EVENT_CONNECT_ERROR) { args ->
            listener.onConnectionChanged(false)
            val message = when (val a = args.firstOrNull()) {
                is JSONObject -> a.optString("message")
                is Throwable -> a.message
                else -> a?.toString()
            }
            if (message == "unauthorized") {
                // Reconnecting with the same stale token would fail forever; let the caller fetch a new one
                s.io().reconnection(false)
                listener.onUnauthorized()
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

    companion object {
        val SERVER_EVENTS = listOf(
            "init", "chunk_data", "player_joined", "player_updated", "player_left", "position_corrected",
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
