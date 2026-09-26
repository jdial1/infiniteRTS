package io.github.jdial1.infiniterts.model

import kotlin.math.abs
import kotlin.math.roundToInt

/** Player colours arrive as CSS: "hsl(212.5, 80%, 60%)" or "#rrggbb". Returns ARGB. */
object CssColor {
    fun parse(css: String?, fallback: Long = 0xFFFFFFFF): Long {
        val s = css?.trim()?.lowercase() ?: return fallback
        return runCatching {
            when {
                s.startsWith("#") && s.length == 7 -> 0xFF000000 or s.substring(1).toLong(16)
                s.startsWith("#") && s.length == 4 -> {
                    val (r, g, b) = s.substring(1).map { "$it$it".toLong(16) }
                    0xFF000000 or (r shl 16) or (g shl 8) or b
                }
                s.startsWith("hsl") -> {
                    val (h, sat, l) = s.substringAfter("(").substringBefore(")").split(",")
                        .map { it.trim().removeSuffix("%").toDouble() }
                    hsl(h, sat / 100, l / 100)
                }
                else -> fallback
            }
        }.getOrDefault(fallback)
    }

    private fun hsl(h: Double, s: Double, l: Double): Long {
        val c = (1 - abs(2 * l - 1)) * s
        val hp = ((h % 360) + 360) % 360 / 60
        val x = c * (1 - abs(hp % 2 - 1))
        val (r1, g1, b1) = when (hp.toInt()) {
            0 -> Triple(c, x, 0.0)
            1 -> Triple(x, c, 0.0)
            2 -> Triple(0.0, c, x)
            3 -> Triple(0.0, x, c)
            4 -> Triple(x, 0.0, c)
            else -> Triple(c, 0.0, x)
        }
        val m = l - c / 2
        fun ch(v: Double) = ((v + m) * 255).roundToInt().coerceIn(0, 255).toLong()
        return 0xFF000000 or (ch(r1) shl 16) or (ch(g1) shl 8) or ch(b1)
    }
}
