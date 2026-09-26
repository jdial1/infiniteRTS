package io.github.jdial1.infiniterts.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.jdial1.infiniterts.BuildMode
import io.github.jdial1.infiniterts.GameViewModel
import io.github.jdial1.infiniterts.Panel
import io.github.jdial1.infiniterts.Scene
import io.github.jdial1.infiniterts.game.GameStore

@Composable
fun GameScreen(vm: GameViewModel, store: GameStore) {
    Box(Modifier.fillMaxSize()) {
        MapView(vm, store)
        if (vm.scene == Scene.PLAYING) PlayingOverlay(vm, store)
    }
}

@Composable
private fun PlayingOverlay(vm: GameViewModel, store: GameStore) {
    vm.observe()
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().safeDrawingPadding()) {
            ResourceBar(vm, store)
            ActionRow(vm, store)
            CombatFeed(vm, store)
            Spacer(Modifier.weight(1f))
            vm.buildMode?.let { BuildBanner(vm, it) }
            vm.panel?.let { p ->
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.BottomCenter) {
                    PanelFrame(title = p.title, onClose = { vm.panel = null }) {
                        when (p) {
                            Panel.WORKERS -> WorkersPanel(vm, store)
                            Panel.STRUCTURES -> StructuresPanel(vm, store)
                            Panel.DIRECTIVES -> DirectivesPanel(vm, store)
                        }
                    }
                }
            }
            TabBar(vm)
        }

        vm.toast?.let { Toast(it) }
        if (!vm.connected) OfflineBanner()
        Dialogs(vm, store)
    }
}

private val Panel.title get() = when (this) {
    Panel.WORKERS -> "Operations"
    Panel.STRUCTURES -> "Structures & Units"
    Panel.DIRECTIVES -> "Directives"
}

@Composable
private fun ResourceBar(vm: GameViewModel, store: GameStore) {
    vm.observe()
    val inv = store.inventory
    val perMin = store.rates.perMinute
    Row(
        Modifier
            .fillMaxWidth()
            .padding(6.dp)
            .background(Palette.Panel, RoundedCornerShape(6.dp))
            .border(1.dp, Palette.Edge, RoundedCornerShape(6.dp))
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        for ((type, amount) in listOf("wood" to inv.wood, "stone" to inv.stone, "gold" to inv.gold)) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(type.uppercase(), color = Palette.Muted, fontSize = 9.sp, letterSpacing = 2.sp)
                Row(verticalAlignment = Alignment.Bottom) {
                    Text("${amount.toInt()}", color = Palette.resource(type), fontWeight = FontWeight.Black, fontSize = 16.sp)
                    Text(" +${perMin[type].toInt()}/min", color = Palette.Cyan, fontSize = 9.sp)
                }
            }
        }
    }
}

@Composable
private fun ActionRow(vm: GameViewModel, store: GameStore) {
    vm.observe()
    Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(10.dp).background(if (vm.connected) Color(0xFF22C55E) else Palette.Red, CircleShape))
        Spacer(Modifier.width(4.dp))
        HudIcon(Icons.Filled.Star, "Standings") { vm.showStandings = true }
        HudIcon(Icons.Filled.Info, "Help") { vm.showHelp = true }
        Spacer(Modifier.weight(1f))
        HudIcon(Icons.Filled.Person, "Center on commander") { vm.centerOnHero() }
        if (store.myBase != null) HudIcon(Icons.Filled.Home, "Center on base") { vm.centerOnBase() }
        TextButton(onClick = { vm.scene = Scene.MENU }) { Text("MENU", color = Palette.Muted, fontSize = 11.sp) }
    }
}

@Composable
private fun HudIcon(icon: ImageVector, description: String, onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.size(40.dp)) {
        Icon(icon, contentDescription = description, tint = Palette.Cyan)
    }
}

// The last ten seconds of this player's fights and ledger lines; tap one to look at it
@Composable
private fun CombatFeed(vm: GameViewModel, store: GameStore) {
    vm.observe()
    Column(Modifier.padding(horizontal = 6.dp).widthIn(max = 320.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        for (item in store.feed.toList().takeLast(4)) {
            Text(
                item.message,
                color = if (item.lost) Palette.Red else Palette.Text,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .background(Palette.PanelInset.copy(alpha = 0.85f), RoundedCornerShape(3.dp))
                    .clickable { vm.lookAt(item.x, item.y) }
                    .padding(horizontal = 6.dp, vertical = 3.dp),
            )
        }
    }
}

@Composable
private fun BuildBanner(vm: GameViewModel, mode: BuildMode) {
    val text = when (mode) {
        BuildMode.DEMOLISH -> "DEMOLISH: tap one of your buildings"
        BuildMode.BASE -> "DEPLOY BASE: tap where it should stand"
        else -> "PLACE ${mode.name}: tap inside your borders"
    }
    Row(
        Modifier
            .fillMaxWidth()
            .padding(6.dp)
            .background(if (mode == BuildMode.DEMOLISH) Color(0xE07F1D1D) else Color(0xE0164E63), RoundedCornerShape(6.dp))
            .padding(horizontal = 12.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        TextButton(onClick = { vm.buildMode = null }) { Text("DONE", color = Color.White) }
    }
}

@Composable
private fun TabBar(vm: GameViewModel) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(6.dp)
            .background(Palette.Panel, RoundedCornerShape(10.dp))
            .border(2.dp, Palette.Ink, RoundedCornerShape(10.dp)),
    ) {
        for (p in Panel.entries) {
            val selected = vm.panel == p
            val label = when (p) {
                Panel.WORKERS -> "⛏\nMINERS"
                Panel.STRUCTURES -> "⚒\nSTRUCTURES"
                Panel.DIRECTIVES -> "⇈\nUPGRADES"
            }
            Box(
                Modifier
                    .weight(1f)
                    .height(56.dp)
                    .background(if (selected) Color(0xFF164E63) else Color.Transparent, RoundedCornerShape(8.dp))
                    .clickable { vm.panel = if (selected) null else p },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    color = if (selected) Color.White else Palette.Muted,
                    fontSize = 11.sp,
                    letterSpacing = 1.sp,
                    lineHeight = 16.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
        }
    }
}

@Composable
fun PanelFrame(title: String, onClose: () -> Unit, content: @Composable () -> Unit) {
    Column(
        Modifier
            .widthIn(max = 480.dp)
            .fillMaxWidth()
            .padding(horizontal = 6.dp)
            .background(Palette.Panel, RoundedCornerShape(8.dp))
            .border(1.dp, Palette.Edge, RoundedCornerShape(8.dp))
            .padding(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title.uppercase(), color = Palette.Cyan, fontWeight = FontWeight.Bold, letterSpacing = 2.sp, modifier = Modifier.weight(1f))
            TextButton(onClick = onClose) { Text("✕", color = Palette.Muted) }
        }
        content()
    }
}

@Composable
private fun Toast(message: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            message,
            color = Color.White,
            modifier = Modifier
                .background(Color(0xE0000000), RoundedCornerShape(6.dp))
                .padding(horizontal = 16.dp, vertical = 10.dp),
        )
    }
}

@Composable
private fun OfflineBanner() {
    Box(Modifier.fillMaxSize().safeDrawingPadding(), contentAlignment = Alignment.TopCenter) {
        Text(
            "SIGNAL LOST · re-establishing connection…",
            color = Color.White,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier
                .padding(top = 110.dp)
                .background(Palette.DeepRed, RoundedCornerShape(4.dp))
                .padding(horizontal = 12.dp, vertical = 6.dp),
        )
    }
}

/**
 * The store is plain Kotlin, so Compose can't see it change. Every composable that reads it calls
 * this first: it reads the revision the view model bumps after each server event, which subscribes
 * that composable to recompose on the next one.
 */
@Composable
fun GameViewModel.observe(): Long = revision
