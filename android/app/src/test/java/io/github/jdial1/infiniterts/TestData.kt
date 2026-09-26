package io.github.jdial1.infiniterts

import io.github.jdial1.infiniterts.model.GameConfig
import java.io.File

// The game data the app ships (data/*.json at the repository root), found from the test's working directory
object TestData {
    private val dataDir: File by lazy {
        generateSequence(File(System.getProperty("user.dir")).absoluteFile) { it.parentFile }
            .map { File(it, "data") }
            .first { File(it, "constants.json").exists() }
    }

    val config: GameConfig by lazy {
        GameConfig.parse(
            File(dataDir, "constants.json").readText(),
            File(dataDir, "buildings.json").readText(),
            File(dataDir, "upgrades.json").readText(),
        )
    }
}
