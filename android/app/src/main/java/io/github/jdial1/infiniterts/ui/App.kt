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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.jdial1.infiniterts.GameViewModel
import io.github.jdial1.infiniterts.Scene
import io.github.jdial1.infiniterts.auth.Session

@Composable
fun InfiniteRtsApp(vm: GameViewModel) {
    val session = vm.session
    val store = vm.store
    Box(Modifier.fillMaxSize().background(Palette.Ink)) {
        when {
            !vm.sessionResolved -> Splash("Checking credentials…")
            session == null || store == null -> SignInScreen(vm)
            else -> {
                GameScreen(vm, store)
                if (vm.scene == Scene.MENU) MainMenu(vm, session)
            }
        }
    }
}

@Composable
fun Title() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            "★ RED OCTOBER:",
            color = Palette.Red,
            fontSize = 34.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 4.sp,
        )
        Text("OVERLORD COMMAND", color = Palette.Text, fontSize = 16.sp, letterSpacing = 6.sp)
    }
}

@Composable
private fun Splash(message: String) {
    Column(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Title()
        Spacer(Modifier.height(24.dp))
        Text(message.uppercase(), color = Palette.Muted, fontSize = 12.sp, letterSpacing = 2.sp)
    }
}

@Composable
private fun SignInScreen(vm: GameViewModel) {
    val activity = LocalContext.current
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Title()
        Spacer(Modifier.height(32.dp))
        Text(
            "Your commander, borders, and ledger follow your Google account.",
            color = Palette.Muted,
            textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(max = 320.dp),
        )
        Spacer(Modifier.height(20.dp))
        Button(
            onClick = { vm.signIn(activity) },
            enabled = !vm.signingIn,
            modifier = Modifier.widthIn(min = 260.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Palette.Cyan, contentColor = Palette.Ink),
        ) {
            if (vm.signingIn) CircularProgressIndicator(Modifier.size(18.dp), color = Palette.Ink, strokeWidth = 2.dp)
            else Text("SIGN IN WITH GOOGLE", fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
        }
        if (vm.guestAllowed) {
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = { vm.playAsGuest() }, modifier = Modifier.widthIn(min = 260.dp)) {
                Text("PLAY AS GUEST (DEV SERVER)", color = Palette.Text, letterSpacing = 1.sp)
            }
        }
        vm.authError?.let {
            Spacer(Modifier.height(16.dp))
            Text(it, color = Palette.Red, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 320.dp))
        }
    }
}

@Composable
private fun MainMenu(vm: GameViewModel, session: Session) {
    val me = vm.store?.me
    Column(
        Modifier.fillMaxSize().background(Color(0xCC09090B)).safeDrawingPadding().padding(24.dp),
        verticalArrangement = Arrangement.SpaceBetween,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.padding(top = 32.dp)) { Title() }
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            // The commander card: game name, the account behind it, and the way out
            Row(
                Modifier
                    .widthIn(max = 360.dp)
                    .fillMaxWidth()
                    .background(Palette.PanelInset, RoundedCornerShape(6.dp))
                    .border(1.dp, Palette.Edge, RoundedCornerShape(6.dp))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("COMMANDER", color = Palette.Muted, fontSize = 10.sp, letterSpacing = 2.sp)
                    Text(me?.name ?: "Connecting…", color = Palette.Text, fontWeight = FontWeight.Bold)
                    Text(
                        (session.displayName?.let { "$it · " } ?: "") + "Sign out",
                        color = Palette.Muted,
                        fontSize = 11.sp,
                        modifier = Modifier.clickable { vm.signOut() },
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("GOLD", color = Palette.Muted, fontSize = 10.sp, letterSpacing = 2.sp)
                    Text("${vm.store?.inventory?.gold?.toInt() ?: 0}", color = Palette.Gold, fontWeight = FontWeight.Black)
                }
            }
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = { vm.scene = Scene.PLAYING },
                enabled = me != null,
                modifier = Modifier.widthIn(max = 360.dp).fillMaxWidth().height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Palette.Cyan, contentColor = Palette.Ink),
                shape = RoundedCornerShape(6.dp),
            ) {
                Text(if (me == null) "CONNECTING…" else "⚔  START MATCH", fontWeight = FontWeight.Black, letterSpacing = 2.sp)
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}
