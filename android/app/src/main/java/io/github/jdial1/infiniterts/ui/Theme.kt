package io.github.jdial1.infiniterts.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import io.github.jdial1.infiniterts.model.CssColor

// The web client's palette: dark gunmetal panels, cyan instruments, Soviet red
object Palette {
    val Ink = Color(0xFF0B1016)
    val Panel = Color(0xFF151C24)
    val PanelInset = Color(0xFF0E141B)
    val Edge = Color(0xFF2A3A4A)
    val Cyan = Color(0xFF22D3EE)
    val Red = Color(0xFFF86565)
    val DeepRed = Color(0xFFCC0000)
    val Amber = Color(0xFFF59E0B)
    val Muted = Color(0xFF71717A)
    val Text = Color(0xFFE4E4E7)
    val Wood = Color(0xFFB45309)
    val Stone = Color(0xFF9CA3AF)
    val Gold = Color(0xFFEAB308)
    val Neutral = Color(0xFF6B7280)

    fun resource(type: String?) = when (type) {
        "wood" -> Wood
        "stone" -> Stone
        "gold" -> Gold
        else -> Muted
    }

    fun player(css: String?) = Color(CssColor.parse(css))
}

@Composable
fun InfiniteRtsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Palette.Cyan,
            onPrimary = Palette.Ink,
            secondary = Palette.Red,
            background = Palette.Ink,
            surface = Palette.Panel,
            onSurface = Palette.Text,
            onBackground = Palette.Text,
            error = Palette.Red,
        ),
        content = content,
    )
}
