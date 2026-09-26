package io.github.jdial1.infiniterts

import android.app.Application
import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import io.github.jdial1.infiniterts.auth.AuthRepository
import io.github.jdial1.infiniterts.auth.Session
import io.github.jdial1.infiniterts.game.GameStore
import io.github.jdial1.infiniterts.model.Building
import io.github.jdial1.infiniterts.model.GameConfig
import io.github.jdial1.infiniterts.model.LaborRatio
import io.github.jdial1.infiniterts.net.GameConnection
import io.github.jdial1.infiniterts.rules.Rules
import io.github.jdial1.infiniterts.rules.Territory
import kotlinx.coroutines.launch
import java.util.UUID
import kotlin.math.hypot
import kotlin.math.max

enum class Scene { MENU, PLAYING }
enum class Panel { WORKERS, STRUCTURES, DIRECTIVES }
enum class BuildMode(val type: String?) { BASE("base"), WALL("wall"), TURRET("turret"), DEMOLISH(null) }

private const val RELEASE_AFTER_BACKGROUND_MS = 30_000L

class GameViewModel(app: Application) : AndroidViewModel(app), GameConnection.Listener {
    val config: GameConfig = app.assets.let { a ->
        GameConfig.parse(
            a.open("constants.json").bufferedReader().use { it.readText() },
            a.open("buildings.json").bufferedReader().use { it.readText() },
            a.open("upgrades.json").bufferedReader().use { it.readText() },
        )
    }
    private val auth = AuthRepository(app)
    private val main = Handler(Looper.getMainLooper())

    // --- Session and connection ---
    var session by mutableStateOf<Session?>(null)
        private set
    var sessionResolved by mutableStateOf(false)
        private set
    var connected by mutableStateOf(false)
        private set
    var authError by mutableStateOf<String?>(null)
    var signingIn by mutableStateOf(false)
        private set
    val guestAllowed = BuildConfig.ALLOW_GUEST

    /** The world as this client knows it; replaced on every new session. */
    var store by mutableStateOf<GameStore?>(null)
        private set
    /** Bumped after every server event, so panels that read it recompose. */
    var revision by mutableLongStateOf(0L)
        private set

    private var connection: GameConnection? = null
    private var tokenRetries = 0

    // In the background the app lets go of its connection, so an idle phone never keeps the server
    // awake; with nobody connected the server saves, rests, and scales to zero.
    private var released = false
    private val release = Runnable {
        connection?.disconnect()
        connection = null
        connected = false
        released = true
    }

    // --- Screen state ---
    var scene by mutableStateOf(Scene.MENU)
    var panel by mutableStateOf<Panel?>(null)
    var buildMode by mutableStateOf<BuildMode?>(null)
    var showStandings by mutableStateOf(false)
    var showHelp by mutableStateOf(false)
    var pendingDemolish by mutableStateOf<Building?>(null)
    var toast by mutableStateOf<String?>(null)
        private set

    // --- Camera and movement (read every frame by the map) ---
    var cameraX = 0.0
    var cameraY = 0.0
    var zoom by mutableFloatStateOf(1f)
        private set
    private var followHero = true
    private var moveTargetX: Double? = null
    private var moveTargetY: Double? = null
    private var pendingGather: String? = null
    private var lastMoveSent = 0L
    private var lastChunkCheck = 0L
    private var toastUntil = 0L

    init {
        viewModelScope.launch {
            auth.googleSession.collect { google ->
                if (session !is Session.Guest) changeSession(google)
                sessionResolved = true
            }
        }
    }

    private fun changeSession(next: Session?) {
        if (next?.uid == session?.uid) return
        main.removeCallbacks(release)
        released = false
        connection?.disconnect()
        connection = null
        connected = false
        session = next
        store = next?.let { GameStore(config, it.uid) }
        scene = Scene.MENU
        panel = null
        buildMode = null
        followHero = true
        if (next != null) connect(next, forceRefresh = false)
    }

    private fun connect(s: Session, forceRefresh: Boolean) {
        viewModelScope.launch {
            val token = if (s is Session.Google) runCatching { auth.idToken(forceRefresh) }.getOrNull() else null
            if (s is Session.Google && token == null) {
                authError = "Couldn't get a sign-in token. Check your connection and try again."
                return@launch
            }
            val c = connection ?: GameConnection(BuildConfig.GAME_SERVER_URL, this@GameViewModel).also { connection = it }
            c.connect(s.uid, token)
        }
    }

    fun signIn(activityContext: Context) {
        if (signingIn) return
        signingIn = true
        authError = null
        viewModelScope.launch {
            runCatching { auth.signInWithGoogle(activityContext) }
                .onFailure { e ->
                    // Backing out of the account picker isn't an error worth showing
                    if (e !is androidx.credentials.exceptions.GetCredentialCancellationException) {
                        authError = "Sign-in failed: ${e.message ?: e.javaClass.simpleName}"
                    }
                }
            signingIn = false
        }
    }

    fun playAsGuest() {
        if (!guestAllowed) return
        val prefs = getApplication<Application>().getSharedPreferences("game", Context.MODE_PRIVATE)
        val id = prefs.getString("guest_id", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("guest_id", it).apply()
        }
        changeSession(Session.Guest(id))
    }

    fun signOut() {
        val wasGuest = session is Session.Guest
        changeSession(null)
        if (!wasGuest) viewModelScope.launch { auth.signOut() }
    }

    // --- GameConnection.Listener: called on the socket's thread ---
    override fun onEvent(event: String, json: String) {
        main.post {
            val s = store ?: return@post
            val firstInit = event == "init" && !s.initialized
            runCatching { s.apply(event, json) }
            if (firstInit) s.me?.let { cameraX = it.x; cameraY = it.y }
            revision++
        }
    }

    override fun onConnectionChanged(connected: Boolean) {
        main.post {
            this.connected = connected
            if (connected) tokenRetries = 0
        }
    }

    override fun onUnauthorized() {
        main.post {
            val s = session ?: return@post
            if (s is Session.Google && tokenRetries < 2) {
                tokenRetries++
                connect(s, forceRefresh = true)
            } else {
                authError = "The server couldn't verify your sign-in. Sign out and sign in again."
            }
        }
    }

    /** The app left the screen. A short grace covers quick switches and Google's account picker. */
    fun onAppBackgrounded() {
        main.removeCallbacks(release)
        main.postDelayed(release, RELEASE_AFTER_BACKGROUND_MS)
    }

    /** Back on screen: reconnect if the connection was released. The server replays the world and the away report. */
    fun onAppForegrounded() {
        main.removeCallbacks(release)
        if (released) {
            released = false
            session?.let { connect(it, forceRefresh = false) }
        }
    }

    override fun onCleared() {
        main.removeCallbacks(release)
        connection?.disconnect()
        super.onCleared()
    }

    // --- Every frame ---
    fun frame(dt: Double, viewWidth: Int, viewHeight: Int, nowMs: Long) {
        val s = store ?: return
        s.expire(nowMs)
        if (toast != null && nowMs > toastUntil) toast = null
        val me = s.me ?: return

        s.positionCorrection?.let { s.positionCorrection = null }

        // Walk the hero toward its target at its legal speed; the server clamps anything faster
        val tx = moveTargetX
        val ty = moveTargetY
        if (tx != null && ty != null && dt > 0) {
            val nearWall = s.buildings.values.any { it.ownerId == s.myId && it.type == "wall" && hypot(it.x - me.x, it.y - me.y) < 150 }
            val step = Rules.heroSpeed(config, me, nearWall) * dt
            val dist = hypot(tx - me.x, ty - me.y)
            if (dist <= step) {
                me.x = tx; me.y = ty
                moveTargetX = null; moveTargetY = null
            } else {
                me.x += (tx - me.x) / dist * step
                me.y += (ty - me.y) / dist * step
            }
            if (nowMs - lastMoveSent > 50) {
                connection?.move(me.x, me.y)
                lastMoveSent = nowMs
            }
        }
        pendingGather?.let { id ->
            val r = s.resources[id]
            if (r == null) pendingGather = null
            else if (hypot(r.x - me.x, r.y - me.y) < config.c("MANUAL_GATHER_RANGE")) {
                connection?.gather(id)
                pendingGather = null
            }
        }

        if (followHero) {
            val k = (5 * dt).coerceAtMost(1.0)
            cameraX += (me.x - cameraX) * k
            cameraY += (me.y - cameraY) * k
        }

        // Ask for the map chunks around the view
        if (nowMs - lastChunkCheck > 500) {
            lastChunkCheck = nowMs
            val radius = max(viewWidth, viewHeight) / zoom / 2.0 + config.c("CHUNK_SIZE") / 2
            val keys = s.chunksToRequest(cameraX, cameraY, radius)
            if (keys.isNotEmpty()) connection?.requestChunks(keys)
        }
    }

    // --- Map input ---
    fun screenToWorld(sx: Float, sy: Float, width: Int, height: Int): Pair<Double, Double> =
        Pair(cameraX + (sx - width / 2f) / zoom, cameraY + (sy - height / 2f) / zoom)

    fun onPanZoom(panX: Float, panY: Float, zoomChange: Float) {
        if (panX != 0f || panY != 0f) {
            followHero = false
            cameraX -= panX / zoom
            cameraY -= panY / zoom
        }
        if (zoomChange != 1f) zoom = (zoom * zoomChange).coerceIn(0.2f, 3f)
    }

    fun onMapTap(x: Double, y: Double) {
        val s = store ?: return
        val me = s.me ?: return
        when (val mode = buildMode) {
            BuildMode.DEMOLISH -> {
                val target = s.buildings.values
                    .filter { it.ownerId == s.myId && it.type != "outpost" }
                    .minByOrNull { hypot(it.x - x, it.y - y) }
                    ?.takeIf { hypot(it.x - x, it.y - y) <= (config.def(it.type)?.size ?: 10.0) + 24 / zoom }
                if (target != null) pendingDemolish = target else showToast("Tap one of your own buildings")
            }
            BuildMode.BASE, BuildMode.WALL, BuildMode.TURRET -> {
                val type = mode.type!!
                if (type != "base") {
                    if (s.myBase == null) return showToast("Deploy your Command Base first")
                    if (!Territory.isPointInTerritory(config, s.myId, s.buildings.values, x, y)) {
                        return showToast("Outside your borders")
                    }
                } else if (s.myBase != null) {
                    buildMode = null
                    return showToast("You already have a Command Base")
                }
                if (!s.inventory.covers(Rules.buildCost(config, type, me))) return showToast("Not enough resources")
                connection?.build(type, x, y)
                if (type == "base") buildMode = null
            }
            null -> {
                val hit = s.resources.values
                    .minByOrNull { hypot(it.x - x, it.y - y) }
                    ?.takeIf { hypot(it.x - x, it.y - y) < 30 / zoom.coerceAtMost(1f) }
                if (hit != null && hypot(hit.x - me.x, hit.y - me.y) < config.c("MANUAL_GATHER_RANGE")) {
                    connection?.gather(hit.id)
                } else {
                    moveTargetX = hit?.x ?: x
                    moveTargetY = hit?.y ?: y
                    pendingGather = hit?.id
                    followHero = true
                }
            }
        }
    }

    fun centerOnHero() {
        followHero = true
        store?.me?.let { cameraX = it.x; cameraY = it.y }
    }

    fun centerOnBase() {
        store?.myBase?.let {
            followHero = false
            cameraX = it.x; cameraY = it.y
        }
    }

    fun lookAt(x: Double, y: Double) {
        followHero = false
        cameraX = x; cameraY = y
    }

    private fun showToast(message: String) {
        toast = message
        toastUntil = System.currentTimeMillis() + 2500
    }

    // --- Commands ---
    fun selectTraits(traits: List<String>) { if (traits.size == 2) connection?.selectTraits(traits) }
    fun trainWorker() { connection?.trainWorker() }
    fun assignWorker(resource: String, delta: Int) { connection?.assignWorker(resource, delta) }
    fun setRatio(ratio: LaborRatio) { connection?.setLaborRatio(ratio.wood, ratio.stone, ratio.gold) }
    fun toggleStandingOrders(on: Boolean) {
        if (on) connection?.setLaborRatio(1, 1, 1) else connection?.clearLaborRatio()
    }
    fun purchaseUpgrade(id: String) { connection?.purchaseUpgrade(id) }
    fun deliverToPlan() { connection?.deliverToPlan() }
    fun confirmDemolish() {
        pendingDemolish?.let { connection?.demolish(it.id) }
        pendingDemolish = null
    }
    fun dismissAwayReport() {
        store?.awayReport = null
        revision++
    }
}
