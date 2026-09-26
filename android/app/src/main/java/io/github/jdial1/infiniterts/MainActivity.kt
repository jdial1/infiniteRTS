package io.github.jdial1.infiniterts

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import io.github.jdial1.infiniterts.ui.InfiniteRtsApp
import io.github.jdial1.infiniterts.ui.InfiniteRtsTheme

class MainActivity : ComponentActivity() {
    private val viewModel: GameViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            InfiniteRtsTheme {
                InfiniteRtsApp(viewModel)
            }
        }
    }
}
