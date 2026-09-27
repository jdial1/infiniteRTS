# Red October: Overlord Command (infiniteRTS)

A persistent, competitive RTS on one endless shared map. Players claim outposts, route workers, fulfil the Plan, and hold ground against each other.

| Part | Where | What it is |
| --- | --- | --- |
| Game server | `server.ts`, `server/`, `src/`, `data/` | The authoritative simulation (Node, Socket.IO, 10 ticks a second): movement, fog, captures, combat, the Plan, standings |
| Android app | `android/` | The client: Kotlin and Jetpack Compose, with Google sign-in through Firebase Auth. See [android/README.md](android/README.md) |

`data/*.json` (buildings, upgrades, constants) is shared: the server imports it and the app bundles it as assets, so both use one set of numbers. `src/rules.ts` and `android/.../rules/Rules.kt` hold the same formulas; change them together.

## Run the server locally

**Prerequisites:** Node.js 22.

```sh
npm install
npm run dev
```

Without a Firebase project configured, the server accepts guests (no sign-in) and saves the world to `saves/world.json` every 30 seconds and on shutdown. Set `WORLD_FILE` to use a different path; delete the file to start a fresh world. To play against it from the Android emulator, see [android/README.md](android/README.md).

## Production

Players sign in with Google (Firebase Authentication). The game server runs on Cloud Run as a single always-on instance, and the world is saved in Cloud Firestore. See [docs/DEPLOY.md](docs/DEPLOY.md) for the setup and deploy commands, and `.env.example` for every server variable.

How the server starts and how the app connects, and how to read their logs when something gets stuck, is in [docs/STARTUP.md](docs/STARTUP.md).

The game's design soul, and why its systems work the way they do, is in [docs/SOUL.md](docs/SOUL.md).
