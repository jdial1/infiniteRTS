package io.github.jdial1.infiniterts.ui

import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import io.github.jdial1.infiniterts.GameViewModel
import io.github.jdial1.infiniterts.game.GameStore
import io.github.jdial1.infiniterts.model.Building
import io.github.jdial1.infiniterts.rules.Rules
import io.github.jdial1.infiniterts.rules.Territory
import kotlin.math.floor
import kotlin.math.max

/** The world, drawn every frame: ground, borders, what stands on them, and the fog over the rest. */
@Composable
fun MapView(vm: GameViewModel, store: GameStore, modifier: Modifier = Modifier) {
    var frameTime by remember { mutableLongStateOf(0L) }
    var viewSize by remember { mutableStateOf(IntSize.Zero) }

    LaunchedEffect(store) {
        var last = 0L
        while (true) {
            withFrameNanos { t ->
                val dt = if (last == 0L) 0.0 else ((t - last) / 1e9).coerceAtMost(0.1)
                last = t
                vm.frame(dt, viewSize.width, viewSize.height, System.currentTimeMillis())
                frameTime = t
            }
        }
    }

    val text = remember {
        Paint().apply {
            isAntiAlias = true
            textAlign = Paint.Align.CENTER
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
    }

    Canvas(
        modifier
            .fillMaxSize()
            .onSizeChanged { viewSize = it }
            .pointerInput(store) {
                detectTransformGestures { _, pan, zoomChange, _ -> vm.onPanZoom(pan.x, pan.y, zoomChange) }
            }
            .pointerInput(store) {
                detectTapGestures { offset ->
                    val (wx, wy) = vm.screenToWorld(offset.x, offset.y, size.width, size.height)
                    vm.onMapTap(wx, wy)
                }
            },
    ) {
        // Reading frameTime here redraws the map on every frame
        if (frameTime >= 0L) MapPainter(this, vm, store, text).paint(System.currentTimeMillis())
    }
}

private class MapPainter(
    private val d: DrawScope,
    private val vm: GameViewModel,
    private val store: GameStore,
    private val text: Paint,
) {
    private val config = store.config
    private val zoom = vm.zoom
    private val camX = vm.cameraX
    private val camY = vm.cameraY
    private val halfW = d.size.width / 2
    private val halfH = d.size.height / 2

    private fun sx(x: Double) = ((x - camX) * zoom).toFloat() + halfW
    private fun sy(y: Double) = ((y - camY) * zoom).toFloat() + halfH
    private fun at(x: Double, y: Double) = Offset(sx(x), sy(y))
    private fun len(v: Double) = (v * zoom).toFloat()

    private val viewRadius = max(d.size.width, d.size.height) / zoom / 2.0 + 100
    private fun inView(x: Double, y: Double, margin: Double = 0.0) =
        x > camX - viewRadius - margin && x < camX + viewRadius + margin &&
            y > camY - viewRadius - margin && y < camY + viewRadius + margin

    private fun color(ownerId: String?): Color =
        if (ownerId == null || ownerId == "neutral") Palette.Neutral else Palette.player(store.players[ownerId]?.color)

    fun paint(now: Long) {
        d.drawRect(Palette.Ink)
        grid()
        zones()
        territories()
        resources()
        store.buildings.values.forEach { if (inView(it.x, it.y, 60.0)) building(it) }
        workers()
        heroes()
        effects(now)
        fog()
    }

    private fun label(s: String, x: Float, y: Float, color: Color, sizePx: Float) {
        text.color = color.toArgb()
        text.textSize = sizePx
        d.drawIntoCanvas { it.nativeCanvas.drawText(s, x, y, text) }
    }

    private fun grid() {
        val g = config.c("GRID_SIZE")
        val line = Color(0x802A3C50)
        var x = floor((camX - viewRadius) / g) * g
        while (x <= camX + viewRadius) {
            d.drawLine(line, Offset(sx(x), 0f), Offset(sx(x), d.size.height), 1f)
            x += g
        }
        var y = floor((camY - viewRadius) / g) * g
        while (y <= camY + viewRadius) {
            d.drawLine(line, Offset(0f, sy(y)), Offset(d.size.width, sy(y)), 1f)
            y += g
        }
    }

    private fun zones() {
        for (z in store.zones.values) {
            if (!inView(z.x, z.y, z.radius)) continue
            val c = when (z.type) {
                "forest" -> Palette.Wood
                "mountain" -> Palette.Stone
                else -> Palette.Gold
            }
            d.drawCircle(c.copy(alpha = 0.08f), len(z.radius), at(z.x, z.y))
            d.drawCircle(c.copy(alpha = 0.3f), len(z.radius), at(z.x, z.y), style = Stroke(1.5f))
            label(z.name.uppercase(), sx(z.x), sy(z.y - z.radius) + 16f, c.copy(alpha = 0.7f), 11f * zoom.coerceIn(0.8f, 1.6f))
        }
    }

    private fun territories() {
        val owners = store.buildings.values.map { it.ownerId }.filter { it != "neutral" }.toSet()
        for (owner in owners) {
            val c = color(owner)
            for (shape in Territory.shapes(config, owner, store.buildings.values)) {
                when (shape) {
                    is Territory.Shape.Circle -> if (inView(shape.x, shape.y, shape.r)) {
                        d.drawCircle(c.copy(alpha = 0.07f), len(shape.r), at(shape.x, shape.y))
                        d.drawCircle(c.copy(alpha = 0.35f), len(shape.r), at(shape.x, shape.y), style = Stroke(1.5f))
                    }
                    is Territory.Shape.Rect -> d.drawRect(
                        c.copy(alpha = 0.07f),
                        topLeft = at(shape.left, shape.top),
                        size = Size(len(shape.right - shape.left), len(shape.bottom - shape.top)),
                    )
                }
            }
        }
    }

    private fun resources() {
        for (r in store.resources.values) {
            if (!inView(r.x, r.y, 20.0)) continue
            val full = store.resourceMax[r.id] ?: r.amount
            val share = if (full > 0) (r.amount / full).coerceIn(0.25, 1.0) else 1.0
            val radius = len(12.0 * share).coerceAtLeast(3f)
            val c = Palette.resource(r.type)
            d.drawCircle(c, radius, at(r.x, r.y))
            d.drawCircle(Color.Black.copy(alpha = 0.5f), radius, at(r.x, r.y), style = Stroke(1.5f))
        }
    }

    private fun building(b: Building) {
        val c = color(b.ownerId)
        val size = config.def(b.type)?.size ?: 10.0
        val center = at(b.x, b.y)
        val half = len(size)
        when (b.type) {
            "base" -> {
                d.drawRoundRect(c, Offset(center.x - half, center.y - half), Size(half * 2, half * 2), CornerRadius(half * 0.3f))
                label("★", center.x, center.y + half * 0.45f, Palette.Ink, half * 1.3f)
            }
            "wall" -> {
                d.drawRect(Color(0xFF52525B), Offset(center.x - half, center.y - half), Size(half * 2, half * 2))
                d.drawRect(c, Offset(center.x - half, center.y - half), Size(half * 2, half * 2), style = Stroke(2f))
            }
            "turret" -> {
                d.drawCircle(c, half, center)
                d.drawCircle(Palette.Ink, half * 0.45f, center)
            }
            "outpost" -> outpost(b, c, center, half)
        }
        val maxHp = Rules.maxHealthOf(config, b)
        if (b.type != "outpost" && b.health < maxHp) {
            val w = half * 2
            val top = center.y - half - 8f
            d.drawRect(Color.Black, Offset(center.x - half, top), Size(w, 4f))
            d.drawRect(Palette.Red, Offset(center.x - half, top), Size(w * (b.health / maxHp).toFloat().coerceIn(0f, 1f), 4f))
        }
    }

    private fun outpost(b: Building, c: Color, center: Offset, half: Float) {
        d.drawRoundRect(Palette.Panel, Offset(center.x - half, center.y - half), Size(half * 2, half * 2), CornerRadius(half * 0.25f))
        d.drawRoundRect(c, Offset(center.x - half, center.y - half), Size(half * 2, half * 2), CornerRadius(half * 0.25f), style = Stroke(3f))
        val mark = when (b.subType) {
            "refinery" -> "R"
            "guard_tower" -> "G"
            "market" -> "M"
            "sanctuary" -> "S"
            "fortress" -> "F"
            else -> "◆"
        }
        label(mark, center.x, center.y + half * 0.4f, c, half * 1.1f)
        // The capture ring: who is staking this ground, and how far along
        val progress = (b.captureProgress ?: 0.0).toFloat()
        val ringR = len(150.0)
        if (b.isConflict == true) {
            d.drawCircle(Palette.Red, ringR, center, style = Stroke(3f))
        } else if (b.capturingPlayerId != null || (progress in 0.1f..99.9f)) {
            val rc = if (b.capturingPlayerId != null) color(b.capturingPlayerId) else c
            d.drawCircle(rc.copy(alpha = 0.2f), ringR, center, style = Stroke(2f))
            d.drawArc(
                rc, -90f, progress * 3.6f, false,
                topLeft = Offset(center.x - ringR, center.y - ringR), size = Size(ringR * 2, ringR * 2), style = Stroke(4f),
            )
        }
    }

    private fun workers() {
        for (w in store.workers.values) {
            if (!inView(w.x, w.y, 10.0)) continue
            val p = at(w.x, w.y)
            val r = len(config.def("miner")?.size ?: 11.0).coerceAtLeast(3f) * 0.6f
            d.drawCircle(color(w.ownerId), r, p)
            val carrying = w.inventory.type
            if (carrying != null && w.inventory.amount > 0) d.drawCircle(Palette.resource(carrying), r * 0.5f, p)
            if (w.ownerId == store.myId && w.stall != null) label("!", p.x, p.y - r - 4f, Palette.Amber, 14f)
        }
    }

    private fun heroes() {
        for (p in store.players.values) {
            if (p.hidden) continue
            if (p.id != store.myId && !inView(p.x, p.y, 40.0)) continue
            val c = Palette.player(p.color)
            val center = at(p.x, p.y)
            val r = if (p.id == store.myId) 16f else 13f
            d.drawCircle(c, r, center)
            d.drawCircle(Color.White, r, center, style = Stroke(if (p.id == store.myId) 3f else 1.5f))
            label(p.name.take(1).uppercase(), center.x, center.y + r * 0.4f, Palette.Ink, r * 1.1f)
            label(p.name, center.x, center.y - r - 6f, Color.White, 12f)
        }
    }

    private fun effects(now: Long) {
        for (s in store.shots) {
            val age = (now - s.time).toFloat()
            if (age < 300) d.drawLine(Palette.Red.copy(alpha = 1f - age / 300f), at(s.fromX, s.fromY), at(s.toX, s.toY), 3f)
            val a = (1f - age / 800f).coerceIn(0f, 1f)
            label("-${s.damage.toInt()}", sx(s.toX), sy(s.toY) - 20f - age / 40f, Palette.Red.copy(alpha = a), 13f)
        }
        for (h in store.heals) {
            val t = ((now - h.time) / 1000f).coerceIn(0f, 1f)
            d.drawCircle(Color(0xFF10B981).copy(alpha = 0.6f * (1 - t)), len(h.radius) * t, at(h.x, h.y), style = Stroke(3f))
        }
    }

    // Fog over everything this player can't see, cut with the circles the server uses for vision
    private fun fog() {
        val circles = Territory.visionCircles(
            config, store.myId, store.me?.x, store.me?.y, store.buildings.values,
            store.workers.values.filter { it.ownerId == store.myId }.map { it.x to it.y },
        )
        d.drawIntoCanvas { canvas ->
            canvas.saveLayer(Rect(Offset.Zero, d.size), androidx.compose.ui.graphics.Paint())
            d.drawRect(Color.Black.copy(alpha = 0.85f))
            for (v in circles) {
                val r = len(v.r)
                if (r < 2f || !inView(v.x, v.y, v.r)) continue
                val c = at(v.x, v.y)
                d.drawCircle(
                    brush = Brush.radialGradient(0f to Color.Black, 0.5f to Color.Black, 1f to Color.Transparent, center = c, radius = r),
                    radius = r,
                    center = c,
                    blendMode = BlendMode.DstOut,
                )
            }
            canvas.restore()
        }
    }
}
