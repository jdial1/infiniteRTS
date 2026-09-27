# Red October: the Android client

Kotlin and Jetpack Compose. It connects to the game server over Socket.IO and signs players in with Google through Firebase Authentication.

## Build and run

Requirements: Android Studio (or the Android SDK with platform 35) and JDK 17+.

```sh
cd android
./gradlew installDebug          # builds and installs on a connected device or running emulator
./gradlew test                  # JVM unit tests: rules, the game store, colours
```

Debug builds are signed with `app/debug.keystore`, a shared debug key whose SHA-1 is registered with Firebase. That's why Google sign-in works on every machine's debug build. It is for debug builds only.

### Against a local server

Start the server from the repository root with `npm run dev`. Then:

```sh
./gradlew installDebug -PgameServerUrl=http://10.0.2.2:3000
```

`10.0.2.2` is the host machine as seen from the emulator. A local server without `FIREBASE_PROJECT_ID` accepts guests, so a debug build pointed at anything other than the live server also offers **Play as guest (dev server)**.

To run the protocol test against that server as well:

```sh
GAME_SERVER_URL=http://localhost:3000 ./gradlew test
```

## Connecting

The menu shows a timestamped connection log while the app connects: the ID token, the transport, the server's own startup report, and the world arriving. It has **Retry** and **Copy**, and every line also goes to logcat under `InfiniteRTS`. [docs/STARTUP.md](../docs/STARTUP.md) explains each line, with a troubleshooting table.

## Sleeping

After 30 seconds in the background, the app releases its connection. It reconnects when it comes back to the screen, and the server's away report covers anything that happened meanwhile. When no player is connected, the game server saves the world and sleeps, so billing stops (see `docs/DEPLOY.md`). The first player back wakes it with a cold start of a few seconds.

## Layout

| Package | What's in it |
| --- | --- |
| `model` | The server's JSON wire format, the game's data files (`../data/*.json`, bundled as assets), and CSS colour parsing |
| `rules` | Ports of the server's rules: Plan costs, build, worker, and upgrade costs, refunds, the labour split, territory, and vision |
| `game` | `GameStore`: the world as this client knows it, updated by server events |
| `net` | `GameConnection`: the socket, auth handshake, and every command |
| `auth` | Google sign-in with Credential Manager, exchanged for a Firebase session |
| `ui` | Compose: the map canvas (territory, buildings, workers, heroes, fog), the HUD, panels, and dialogs |
| (root) | `MainActivity` and `GameViewModel`, which own the session, connection, camera, and actions |

`model`, `rules`, `game`, and `net` are plain Kotlin with no Android dependencies, so they're unit-tested on the JVM. `LiveServerTest` plays a short session against a real server.

## Behaviour carried over from the web client

* **Sign-in and the world:** Google sign-in is required. Your commander, borders, ledger, and Plan follow your account.
* **Map:** tap to walk, tap a resource to walk to it and gather by hand, drag to pan, pinch to zoom.
* **Fog:** drawn with the same vision circles the server uses to decide what you're sent.
* **Panels:**
  * Miners: Standing Orders, buying workers, stall reasons, and deliveries per depot.
  * Structures: base, worker, wall, turret, and demolish with a refund preview.
  * Upgrades: the Plan, then the Directives.
* **Dialogs:** doctrine selection, standings, the away report, and help.
* **Differences from the web client:**
  * Overlapping territories are drawn on top of each other instead of split between owners.
  * Map icons are drawn shapes instead of the web's icon font.
  * There's no minimap yet.
