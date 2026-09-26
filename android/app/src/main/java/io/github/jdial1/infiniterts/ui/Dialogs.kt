package io.github.jdial1.infiniterts.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.DialogProperties
import io.github.jdial1.infiniterts.GameViewModel
import io.github.jdial1.infiniterts.game.GameStore
import io.github.jdial1.infiniterts.rules.Rules
import java.text.DateFormat
import java.util.Date

@Composable
fun Dialogs(vm: GameViewModel, store: GameStore) {
    vm.observe()
    val me = store.me
    when {
        me != null && me.traits.isEmpty() -> DoctrineDialog(vm)
        store.awayReport != null -> AwayReportDialog(vm, store)
        vm.pendingDemolish != null -> DemolishDialog(vm)
        vm.showStandings -> StandingsDialog(vm, store)
        vm.showHelp -> HelpDialog(vm)
    }
}

// --- Doctrine: two of three, chosen once ---
private data class Doctrine(val id: String, val name: String, val text: String)

private val DOCTRINES = listOf(
    Doctrine("speed", "Velocity", "Your commander and workers move faster."),
    Doctrine("strength", "Fortitude", "Adds 50% more health to your buildings."),
    Doctrine("cost", "Logistics", "Reduces the cost of all units and buildings by 25%."),
)

@Composable
private fun DoctrineDialog(vm: GameViewModel) {
    var chosen by remember { mutableStateOf(listOf<String>()) }
    AlertDialog(
        onDismissRequest = {},
        properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false),
        containerColor = Palette.Panel,
        title = { Text("SELECT DOCTRINE", color = Palette.Cyan, fontWeight = FontWeight.Bold, letterSpacing = 2.sp) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Authorize two protocols for your command.", color = Palette.Muted, fontSize = 12.sp)
                Rules.mascotFor(chosen)?.let { m ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(14.dp).background(Color(m.color), CircleShape))
                        Spacer(Modifier.width(8.dp))
                        Text(m.label.uppercase(), color = Color.White, fontWeight = FontWeight.Black)
                    }
                }
                for (d in DOCTRINES) {
                    val on = d.id in chosen
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .background(if (on) Color(0xFF164E63) else Palette.PanelInset, RoundedCornerShape(4.dp))
                            .border(1.dp, if (on) Palette.Cyan else Palette.Edge, RoundedCornerShape(4.dp))
                            .clickable {
                                chosen = when {
                                    on -> chosen - d.id
                                    chosen.size < 2 -> chosen + d.id
                                    else -> chosen
                                }
                            }
                            .padding(10.dp),
                    ) {
                        Text(d.name.uppercase(), color = Color.White, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
                        Text(d.text, color = Palette.Muted, fontSize = 11.sp)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { vm.selectTraits(chosen) }, enabled = chosen.size == 2) {
                Text("AUTHORIZE", fontWeight = FontWeight.Bold)
            }
        },
    )
}

// --- The Commissariat report: everything rivals took (or you took) while you were away ---
@Composable
private fun AwayReportDialog(vm: GameViewModel, store: GameStore) {
    val entries = store.awayReport ?: return
    val time = remember { DateFormat.getTimeInstance(DateFormat.SHORT) }
    AlertDialog(
        onDismissRequest = { vm.dismissAwayReport() },
        containerColor = Palette.Panel,
        title = {
            Column {
                Text("WHILE YOU WERE AWAY", color = Palette.Cyan, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
                Text(
                    "Commissariat report · ${entries.count { it.kind == "lost" }} lost · ${entries.count { it.kind == "gained" }} gained",
                    color = Palette.Muted, fontSize = 11.sp,
                )
            }
        },
        text = {
            Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                for (e in entries) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .background(Palette.PanelInset, RoundedCornerShape(4.dp))
                            .clickable { vm.lookAt(e.x, e.y); vm.dismissAwayReport() }
                            .padding(8.dp),
                    ) {
                        Text(e.text, color = if (e.kind == "lost") Palette.Red else Palette.Text, fontSize = 12.sp, modifier = Modifier.weight(1f))
                        Text(time.format(Date(e.time)), color = Palette.Muted, fontSize = 10.sp)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { vm.dismissAwayReport() }) { Text("ACKNOWLEDGE") } },
    )
}

@Composable
private fun DemolishDialog(vm: GameViewModel) {
    val b = vm.pendingDemolish ?: return
    val refund = Rules.demolishRefund(vm.config, b)
    val damaged = b.health < Rules.maxHealthOf(vm.config, b)
    AlertDialog(
        onDismissRequest = { vm.pendingDemolish = null },
        containerColor = Palette.Panel,
        title = { Text("DEMOLISH ${b.type.uppercase()}?", color = Palette.Red, fontWeight = FontWeight.Bold) },
        text = {
            Text(
                "Refund: ${refund.wood.toInt()} wood, ${refund.stone.toInt()} stone, ${refund.gold.toInt()} gold." +
                    if (damaged) " It's damaged, so it refunds only its remaining health." else "",
                color = Palette.Text,
            )
        },
        confirmButton = { TextButton(onClick = { vm.confirmDemolish() }) { Text("DEMOLISH", color = Palette.Red) } },
        dismissButton = { TextButton(onClick = { vm.pendingDemolish = null }) { Text("KEEP IT") } },
    )
}

// --- Standings: held ground and fulfilled Plan phases, nothing else ---
@Composable
private fun StandingsDialog(vm: GameViewModel, store: GameStore) {
    AlertDialog(
        onDismissRequest = { vm.showStandings = false },
        containerColor = Palette.Panel,
        title = { Text("STANDINGS (${store.standings.size})", color = Palette.Cyan, fontWeight = FontWeight.Bold, letterSpacing = 2.sp) },
        text = {
            Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (store.standings.isEmpty()) Text("Waiting for the standings…", color = Palette.Muted)
                store.standings.forEachIndexed { rank, row ->
                    val isMe = row.id == store.myId
                    val known = store.players[row.id]
                    val canLocate = isMe || (known != null && !known.hidden)
                    val mascot = Rules.mascotFor(row.traits)
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .background(if (isMe) Color(0xFF164E63) else Palette.PanelInset, RoundedCornerShape(4.dp))
                            .padding(8.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("#${rank + 1}", color = if (rank == 0) Palette.Gold else Palette.Muted, fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.width(32.dp))
                            Box(Modifier.size(12.dp).background(Palette.player(row.color), CircleShape))
                            Spacer(Modifier.width(6.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    (mascot?.let { "${it.label} - " } ?: "") + row.name + if (isMe) " (you)" else "",
                                    color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp,
                                )
                                Text(if (row.online) "On the map" else "Away", color = Palette.Muted, fontSize = 10.sp)
                            }
                            Text("★ ${row.score.toInt()}", color = Palette.Cyan, fontWeight = FontWeight.Black)
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                "${row.outposts} ground · ${row.planPhase} plan",
                                color = Palette.Muted, fontSize = 10.sp, modifier = Modifier.weight(1f),
                            )
                            if (canLocate) {
                                TextButton(onClick = {
                                    if (isMe) vm.centerOnHero() else known?.let { vm.lookAt(it.x, it.y) }
                                    vm.showStandings = false
                                }) { Text("LOCATE", fontSize = 10.sp) }
                            }
                        }
                    }
                }
                Text(
                    "Score: ${Rules.SCORE_PER_OUTPOST} per outpost held, ${Rules.SCORE_PER_PLAN_PHASE} per Plan phase fulfilled.",
                    color = Palette.Muted, fontSize = 10.sp,
                )
            }
        },
        confirmButton = { TextButton(onClick = { vm.showStandings = false }) { Text("CLOSE") } },
    )
}

@Composable
private fun HelpDialog(vm: GameViewModel) {
    val sections = listOf(
        "Objective" to "Grow your economy and hold ground. The standings count only two things: outposts held and phases of the Plan fulfilled.",
        "Movement" to "Tap the map to walk your commander; tap a resource to walk to it and gather by hand. Drag to pan, pinch to zoom.",
        "Ground" to "Stand in a neutral outpost's ring to claim it, or in a rival's to neutralize it. Your borders are where you can build and where your workers can mine.",
        "Labour" to "Resources only arrive when a worker carries them to your base, an outpost, or a forward depot. Standing Orders keep the worker split you set. A stalled worker tells you why.",
        "The Plan" to "Deliver to your Command Base in phases. Every phase asks for more than the last, and there is always another.",
        "Losses" to "Everything a rival takes is written in your ledger, including while you are away. Demolishing your own building refunds it in full when undamaged.",
    )
    AlertDialog(
        onDismissRequest = { vm.showHelp = false },
        containerColor = Palette.Panel,
        title = { Text("SYSTEMS MANUAL", color = Palette.Cyan, fontWeight = FontWeight.Bold, letterSpacing = 2.sp) },
        text = {
            Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for ((head, body) in sections) {
                    Column {
                        Text(head.uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp, letterSpacing = 2.sp)
                        Text(body, color = Palette.Text, fontSize = 13.sp)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { vm.showHelp = false }) { Text("ACKNOWLEDGE COMMAND") } },
    )
}
