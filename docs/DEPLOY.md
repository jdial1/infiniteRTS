# Deploying

The game runs in the Firebase project `infiniterts-6c5ab` (project number `346111674521`):

| Piece | Service | Why |
| --- | --- | --- |
| Sign-in | Firebase Authentication (Google provider) | Every socket carries a Firebase ID token, and the server verifies it before the player reaches the map |
| The game server | Cloud Run (`infinite-rts-server`, `us-central1`) | The world is a 10 ticks-per-second authoritative simulation over websockets (workers, turrets, captures, fog). Cloud Functions can't hold that, so the server runs as one always-on container |
| The saved world | Cloud Firestore | The server saves the whole world every 30 s and on shutdown (gzipped, split across documents in `worlds/main`) and loads it on start |
| The client | The Android app in `android/` | Built and installed from Gradle; see [android/README.md](../android/README.md) |

Clients never read or write Firestore directly; `firestore.rules` denies everything, and only the server (through the Admin SDK) touches it. That's what keeps fog and anti-cheat real.

## What's already set up

* The project is on the Blaze plan. Google sign-in and Firestore (Native mode, `nam5`) are enabled.
* The Cloud Run, Cloud Build, and Artifact Registry APIs are enabled.
* The server is deployed at `https://infinite-rts-server-346111674521.us-central1.run.app`, the address the Android app uses.
* The Android app `io.github.jdial1.infiniterts` is registered. Its `google-services.json` is in `android/app/`, with the SHA-1 and SHA-256 of the shared debug key (`android/app/debug.keystore`).

## Redeploy the game server (Cloud Run)

```sh
export PROJECT=infiniterts-6c5ab
gcloud config set project "$PROJECT"
gcloud run deploy infinite-rts-server --source . --region us-central1 \
  --allow-unauthenticated \
  --min-instances 1 --max-instances 1 --no-cpu-throttling \
  --session-affinity --timeout 3600 --memory 1Gi \
  --set-env-vars "FIREBASE_PROJECT_ID=$PROJECT"
```

Why those flags:

* **`--max-instances 1`:** the world lives in one process's memory. A second instance would be a second, disconnected world.
* **`--min-instances 1 --no-cpu-throttling`:** the world keeps running while nobody is connected (workers mine, turrets fire, and absent players get an away report). Without these flags, Cloud Run freezes the simulation between requests.
* **`--session-affinity --timeout 3600`:** websockets stay on the instance for up to an hour, and Socket.IO reconnects on its own after that.
* **`--allow-unauthenticated`:** the service is public at the HTTP level; players are authenticated per socket by their Firebase ID token.

On SIGTERM the server saves the world before it exits, and the new revision loads it.

## Firestore rules

```sh
firebase deploy --only firestore:rules
```

## Releasing the Android app

Debug builds are signed with the shared debug key, which is already registered. For a release build:

1. Create an upload key (`keytool -genkeypair ...`) and keep it out of the repository.
2. Add its SHA-1 and SHA-256 to the Android app in Firebase (Project settings → Your apps). If you publish with Play App Signing, add Play's app-signing key fingerprints too. Google sign-in rejects any build whose signing key isn't listed there.
3. Add a `release` signing config in `android/app/build.gradle.kts` that reads the key from local properties or environment variables, then run `./gradlew bundleRelease`.

## The retired web client

The React client was removed from this repository when the Android app replaced it, and it remains in git history. Its last build is still live on Firebase Hosting at https://infiniterts-6c5ab.web.app, and it still works against the same server. Once the Android app is confirmed working, take it down:

```sh
firebase hosting:disable --project infiniterts-6c5ab
```

## Local development

`npm run dev` works without any of this. With no `FIREBASE_PROJECT_ID`, the server accepts guest ids and saves to `saves/world.json`. To test real token verification locally, start it with `FIREBASE_PROJECT_ID=infiniterts-6c5ab npm run dev`; to keep a local save file while doing that, add `WORLD_STORE=file`.

A production server (`NODE_ENV=production`) refuses to start without `FIREBASE_PROJECT_ID`.
