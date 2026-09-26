plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.google.services)
}

// The live game server on Cloud Run. Point a debug build at a local server with
//   ./gradlew installDebug -PgameServerUrl=http://10.0.2.2:3000
// (10.0.2.2 is the host machine from the emulator). A server without FIREBASE_PROJECT_ID
// accepts guests, so debug builds also offer "Play as guest" when the URL isn't the live one.
val liveServerUrl = "https://infinite-rts-server-346111674521.us-central1.run.app"
val gameServerUrl = (findProperty("gameServerUrl") as String?) ?: liveServerUrl

android {
    namespace = "io.github.jdial1.infiniterts"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.jdial1.infiniterts"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "LIVE_SERVER_URL", "\"$liveServerUrl\"")
    }

    signingConfigs {
        // A shared debug key, so every machine's debug builds match the SHA-1 registered in Firebase
        // (Google sign-in rejects apps whose signing key it doesn't know). Debug only; never ship with it.
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "GAME_SERVER_URL", "\"$gameServerUrl\"")
            buildConfigField("boolean", "ALLOW_GUEST", (gameServerUrl != liveServerUrl).toString())
        }
        release {
            buildConfigField("String", "GAME_SERVER_URL", "\"$liveServerUrl\"")
            buildConfigField("boolean", "ALLOW_GUEST", "false")
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Add a release signingConfig (and its SHA-1 in Firebase) before publishing
        }
    }

    // The game's data (buildings, upgrades, constants) is shared with the server: one copy, in ../data
    sourceSets["main"].assets.srcDir(rootProject.file("../data"))

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.core)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services)
    implementation(libs.googleid)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.socketio.client) {
        // Android ships org.json itself
        exclude(group = "org.json", module = "json")
    }

    testImplementation(libs.junit)
    // Android's org.json is a stub in local unit tests; use the real one there
    testImplementation(libs.org.json)
}
