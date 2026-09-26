package io.github.jdial1.infiniterts.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.jdial1.infiniterts.BuildMode
import io.github.jdial1.infiniterts.GameViewModel
import io.github.jdial1.infiniterts.Panel
import io.github.jdial1.infiniterts.game.GameStore
import io.github.jdial1.infiniterts.model.Resources
import io.github.jdial1.infiniterts.rules.Rules

@Composable
private fun Cost(cost: Resources, have: Resources) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        for (t in Resources.TYPES) {
            val need = cost[t]
            if (need > 0) Text("${need.toInt()}${t.first()}", color = if (have[t] < need) Palette.Red else Palette.Muted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun Inset(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(modifier.fillMaxWidth().background(Palette.PanelInset, RoundedCornerShape(4.dp)).padding(8.dp)) { content() }
}

@Composable
private fun SmallButton(text: String, enabled: Boolean = true, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.size(width = 40.dp, height = 36.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
        shape = RoundedCornerShape(4.dp),
    ) { Text(text, color = if (enabled) Color.White else Palette.Muted, fontWeight = FontWeight.Black) }
}

// --- Workers: Standing Orders, hiring, and where the loads went ---
@Composable
fun WorkersPanel(vm: GameViewModel, store: GameStore) {
    vm.observe()
    if (store.me == null) return
    val hasBase = store.myBase != null
    Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (!hasBase) {
            Inset { Text("Deploy your Command Base to authorize personnel.", color = Palette.Amber, fontSize = 12.sp) }
            OutlinedButton(onClick = { vm.panel = Panel.STRUCTURES }, modifier = Modifier.fillMaxWidth()) { Text("OPEN STRUCTURES") }
        } else {
            WorkerControls(vm, store)
        }
    }
}

@Composable
private fun WorkerControls(vm: GameViewModel, store: GameStore) {
    vm.observe()
    val me = store.me ?: return
    val workers = store.myWorkers
    val ratio = me.laborRatio
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Inset {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("STANDING ORDERS", color = Palette.Text, fontWeight = FontWeight.Bold, fontSize = 12.sp, letterSpacing = 1.sp)
                    Text(
                        ratio?.let { "Keep the split ${it.wood}:${it.stone}:${it.gold}" } ?: "Off: assign by hand",
                        color = Palette.Cyan, fontSize = 10.sp,
                    )
                }
                Switch(
                    checked = ratio != null,
                    onCheckedChange = { vm.toggleStandingOrders(it) },
                    colors = SwitchDefaults.colors(checkedTrackColor = Palette.Cyan),
                )
            }
        }
        val cost = Rules.workerCost(vm.config, me, workers.size)
        Button(
            onClick = { vm.trainWorker() },
            enabled = store.inventory.covers(cost),
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(4.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF164E63), contentColor = Color.White),
        ) {
            Text("BUY WORKER  ", fontWeight = FontWeight.Bold)
            Cost(cost, store.inventory)
        }
        for (type in Resources.TYPES) {
            val assigned = workers.count { it.assignedResource == type }
            val stalled = workers.filter { it.assignedResource == type && it.stall != null }
            Inset {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(type.uppercase(), color = Palette.resource(type), fontWeight = FontWeight.Bold, fontSize = 12.sp, letterSpacing = 2.sp)
                        if (stalled.isNotEmpty()) {
                            Text("${stalled.size} stalled: ${stalled.first().stall}", color = Palette.Amber, fontSize = 10.sp)
                        }
                    }
                    if (ratio != null) {
                        Text("$assigned now", color = Palette.Muted, fontSize = 10.sp)
                        Spacer(Modifier.width(6.dp))
                        SmallButton("-", enabled = ratio[type] > 0) { vm.setRatio(ratio.with(type, ratio[type] - 1)) }
                        Text("${ratio[type]}", color = Palette.Cyan, fontWeight = FontWeight.Black, modifier = Modifier.width(32.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                        SmallButton("+", enabled = ratio[type] < 9) { vm.setRatio(ratio.with(type, ratio[type] + 1)) }
                    } else {
                        SmallButton("-", enabled = assigned > 0) { vm.assignWorker(type, -1) }
                        Text("$assigned", color = Palette.Cyan, fontWeight = FontWeight.Black, modifier = Modifier.width(32.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                        SmallButton("+", enabled = workers.any { it.assignedResource == null }) { vm.assignWorker(type, 1) }
                    }
                }
            }
        }
        // Rates: which route pays, over the last minute
        Inset {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("DELIVERED, LAST MINUTE", color = Palette.Muted, fontSize = 9.sp, letterSpacing = 2.sp)
                val depots = store.rates.depots
                if (depots.isEmpty()) Text("Nothing delivered yet.", color = Palette.Muted, fontSize = 11.sp)
                for (d in depots) {
                    Row(Modifier.fillMaxWidth().clickable { vm.lookAt(d.x, d.y) }, verticalAlignment = Alignment.CenterVertically) {
                        Text(d.label.replaceFirstChar { it.uppercase() }, color = Palette.Text, fontSize = 11.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Cost(Resources(d.wood, d.stone, d.gold), Resources(Double.MAX_VALUE, Double.MAX_VALUE, Double.MAX_VALUE))
                    }
                }
            }
        }
    }
}

// --- Structures: what can be placed, and the demolish tool ---
@Composable
fun StructuresPanel(vm: GameViewModel, store: GameStore) {
    vm.observe()
    val me = store.me ?: return
    val hasBase = store.myBase != null
    val workers = store.myWorkers.size
    val inv = store.inventory
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        fun choose(mode: BuildMode) {
            vm.buildMode = if (vm.buildMode == mode) null else mode
            vm.panel = null
        }
        if (!hasBase) {
            StructureItem("Deploy Base", Rules.buildCost(vm.config, "base", me), inv, null, vm.buildMode == BuildMode.BASE) { choose(BuildMode.BASE) }
        }
        StructureItem("Requisition Worker", Rules.workerCost(vm.config, me, workers), inv, if (hasBase) null else "Needs base", false) { vm.trainWorker() }
        val wallLock = when {
            !hasBase -> "Needs base"
            workers < 3 -> "Needs 3 workers"
            else -> null
        }
        StructureItem("Fortification Wall", Rules.buildCost(vm.config, "wall", me), inv, wallLock, vm.buildMode == BuildMode.WALL) { choose(BuildMode.WALL) }
        StructureItem("Defense Turret", Rules.buildCost(vm.config, "turret", me), inv, wallLock, vm.buildMode == BuildMode.TURRET) { choose(BuildMode.TURRET) }
        Row(
            Modifier
                .fillMaxWidth()
                .background(if (vm.buildMode == BuildMode.DEMOLISH) Color(0xFF7F1D1D) else Palette.PanelInset, RoundedCornerShape(4.dp))
                .clickable(enabled = hasBase) { choose(BuildMode.DEMOLISH) }
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("DEMOLISH", color = if (hasBase) Palette.Red else Palette.Muted, fontWeight = FontWeight.Bold, fontSize = 12.sp, letterSpacing = 1.sp, modifier = Modifier.weight(1f))
            Text("FULL REFUND IF UNDAMAGED", color = Palette.Muted, fontSize = 10.sp)
        }
    }
}

@Composable
private fun StructureItem(label: String, cost: Resources, have: Resources, locked: String?, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(if (selected) Color(0xFF164E63) else Palette.PanelInset, RoundedCornerShape(4.dp))
            .clickable(enabled = locked == null, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label.uppercase(), color = if (locked == null) Color.White else Palette.Muted, fontWeight = FontWeight.Bold, fontSize = 12.sp, letterSpacing = 1.sp, modifier = Modifier.weight(1f))
        if (locked != null) Text(locked.uppercase(), color = Palette.Muted, fontSize = 10.sp) else Cost(cost, have)
    }
}

// --- Directives: the Plan, then the upgrades ---
@Composable
fun DirectivesPanel(vm: GameViewModel, store: GameStore) {
    vm.observe()
    val me = store.me ?: return
    val hasBase = store.myBase != null
    val inv = store.inventory
    Column(Modifier.heightIn(max = 440.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (!hasBase) Inset { Text("Deploy your Command Base to authorize research.", color = Palette.Amber, fontSize = 12.sp) }

        // The Plan: the infinite sink, delivered to the Command Base a quarter phase at a time
        val plan = me.plan
        val phase = plan?.phase ?: 0
        val need = Rules.planRequirement(phase)
        val instalment = Rules.planInstalment(phase)
        val delivered = plan?.delivered ?: Resources()
        Inset {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("THE PLAN · PHASE ${phase + 1}", color = Palette.Red, fontWeight = FontWeight.Bold, fontSize = 12.sp, letterSpacing = 1.sp, modifier = Modifier.weight(1f))
                    Text("$phase fulfilled · +${Rules.SCORE_PER_PLAN_PHASE} each", color = Palette.Muted, fontSize = 10.sp)
                }
                for (t in Resources.TYPES) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(t.uppercase(), color = Palette.Muted, fontSize = 10.sp, modifier = Modifier.width(48.dp))
                        LinearProgressIndicator(
                            progress = { (delivered[t] / need[t]).toFloat().coerceIn(0f, 1f) },
                            modifier = Modifier.weight(1f).height(6.dp),
                            color = Palette.DeepRed,
                            trackColor = Color.Black,
                        )
                        Text("${delivered[t].toInt()} / ${need[t].toInt()}", color = Palette.Text, fontSize = 10.sp, modifier = Modifier.width(88.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
                    }
                }
                val canGive = hasBase && Resources.TYPES.any { inv[it] >= 1 && delivered[it] < need[it] }
                Button(
                    onClick = { vm.deliverToPlan() },
                    enabled = canGive,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(4.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Palette.DeepRed, contentColor = Color.White),
                ) {
                    Text(
                        "DELIVER (UP TO ${instalment.wood.toInt()}w ${instalment.stone.toInt()}s ${instalment.gold.toInt()}g)",
                        fontWeight = FontWeight.Bold, fontSize = 12.sp,
                    )
                }
            }
        }

        for (u in vm.config.upgrades.filter { it.requiredTrait == null || it.requiredTrait in me.traits }) {
            val level = me.level(u.id)
            val cost = Rules.upgradeCost(u, level)
            val maxed = Rules.isMaxed(u, level)
            Inset {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(u.name.uppercase(), color = Palette.Text, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            Spacer(Modifier.width(6.dp))
                            Text("L$level", color = Palette.Cyan, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                        Text("${u.target} · ${u.effect}", color = Palette.Amber, fontSize = 10.sp)
                        Text(u.description, color = Palette.Muted, fontSize = 10.sp)
                        Text(Rules.upgradeBonus(vm.config, u, level), color = Palette.Cyan, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        if (!maxed) Cost(cost, inv)
                        Spacer(Modifier.height(4.dp))
                        OutlinedButton(
                            onClick = { vm.purchaseUpgrade(u.id) },
                            enabled = hasBase && !maxed && inv.covers(cost),
                            shape = RoundedCornerShape(4.dp),
                        ) { Text(if (maxed) "MAX" else "UP", fontWeight = FontWeight.Bold) }
                    }
                }
            }
        }
    }
}
