package io.github.jdial1.infiniterts.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer

// The game's data files (data/*.json at the repository root), shared with the server

@Serializable
data class BuildingDef(
    val cost: Resources? = null,
    val health: Double? = null,
    val size: Double = 10.0,
    val displayName: String = "",
    val baseCapacity: Double? = null,
)

@Serializable
data class UpgradeDef(
    val id: String,
    val name: String,
    val description: String = "",
    val category: String = "",
    val target: String = "",
    val effect: String = "",
    val baseCost: Resources = Resources(),
    val requiredTrait: String? = null,
    val maxLevel: Int? = null,
)

class GameConfig(
    val constants: Map<String, Double>,
    val buildings: Map<String, BuildingDef>,
    val upgrades: List<UpgradeDef>,
) {
    fun c(name: String): Double = constants[name] ?: error("Unknown constant $name")
    fun def(type: String): BuildingDef? = buildings[type]

    companion object {
        fun parse(constantsJson: String, buildingsJson: String, upgradesJson: String) = GameConfig(
            constants = GameJson.decodeFromString(MapSerializer(String.serializer(), Double.serializer()), constantsJson),
            buildings = GameJson.decodeFromString(MapSerializer(String.serializer(), BuildingDef.serializer()), buildingsJson),
            upgrades = GameJson.decodeFromString(ListSerializer(UpgradeDef.serializer()), upgradesJson),
        )
    }
}
