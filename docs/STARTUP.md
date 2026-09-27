# Startup and connection

How the game server starts, how the Android app connects, and how to read both logs when something gets stuck.

## The server starting

The server can start in three situations:

* a new revision is deployed;
* Cloud Run wakes it for the first player after it slept (a cold start);
* someone runs `npm run dev` locally.

Every step is logged as it happens, with milliseconds since the process started:

```
[startup +1ms] process started - node v22.x, NODE_ENV=production, revision infinite-rts-server-00003-abc
[startup +5ms] auth configured - Firebase ID tokens for infiniterts-6c5ab
[startup +6ms] phase: loading_world
[startup +6ms] loading world - firestore:worlds/main
[startup +840ms] world loaded - 834ms: 3 players, 44 buildings, 82 resource nodes
[startup +852ms] listening - port 8080
[startup +852ms] phase: ready
```

| Phase | What's happening | Connections |
| --- | --- | --- |
| `booting` | The process started and is reading its configuration | Not accepted yet |
| `loading_world` | Reading the saved world, from Firestore (`worlds/main`) in production or `saves/world.json` locally | Not accepted yet. Cloud Run holds incoming requests until the server listens |
| `ready` | Listening; the simulation is running | Accepted |
| `stopping` | SIGTERM, from a new revision or from scaling to zero. The world is being saved | Closing |

If the world can't be read, the server exits rather than start an empty world over the saved one.

**Where to see it:**

* **Cloud Run:** the server's log in the Cloud Run console (Logs tab), or Cloud Logging filtered to `resource.labels.service_name="infinite-rts-server"`.
* **Health report:** `GET /api/health` returns the same record as JSON:
  * the phase;
  * the revision;
  * the uptime, and `coldStart` (true in the first minute after starting);
  * the auth mode and the world source;
  * how long the world took to load;
  * players online, players, and buildings;
  * every startup step with its timing.

  ```sh
  curl https://infinite-rts-server-346111674521.us-central1.run.app/api/health
  ```

**Every connection is logged too:**

```
[connect] 8H3k…Qz joined over polling: token verified in 42ms, sent 3 players, 44 buildings, 6 workers
[connect] refused Zk1v… over polling after 12ms: ID token rejected (auth/id-token-expired)
No players connected: saving the world before it rests
[shutdown] SIGTERM: 0 players connected; saving the world
```

## The app connecting

The Android app shows its connection log on the menu while it connects. The log stays one tap away ("Connection log") once connected. **Copy** puts the log on the clipboard for a bug report, and every line also goes to logcat under the tag `InfiniteRTS` (`adb logcat -s InfiniteRTS`).

A healthy connection to a sleeping server looks like this:

```
Signed in with Google as Ada (uid 8H3kP2qA…)
+  0.0s INFO  Requesting a Firebase ID token…
+  0.1s INFO  ID token received in 94ms
+  0.1s INFO  Game server: https://infinite-rts-server-346111674521.us-central1.run.app
+  0.1s INFO  Connecting to https://…run.app (with a Firebase ID token)
+  0.2s INFO  Transport: polling
+  3.9s INFO  Server reached (engine handshake complete)
+  4.1s INFO  Connected (socket …); waiting for the world
+  4.1s INFO  Server infinite-rts-server-00003-abc (ready), up 3s; it woke up for this connection (cold start). 1 online, 3 players, 44 buildings.
+  4.1s INFO    server +6ms loading world - firestore:worlds/main
+  4.1s INFO    server +840ms world loaded - 834ms: 3 players, 44 buildings, 82 resource nodes
+  4.2s INFO  Transport: websocket
+  4.3s INFO  World received (61 KB, read in 38ms): 3 players, 44 buildings, 6 workers. Ready as Player 8H3k.
```

The steps, in order:

1. **Session:** who is signed in (Google, or a guest against a dev server).
2. **ID token:** a Firebase ID token for the server to verify. The server rejects expired tokens, so the app asks for a fresh one when that happens.
3. **Transport:** Socket.IO starts with HTTP long-polling and upgrades to a websocket. "Server reached" means the server answered at all.
4. **Connected:** the server accepted the token.
5. **Server status:** the server's own report, sent before anything else. On a cold start the app also lists the server's startup steps.
6. **World received:** the player's state, the public map, and whatever this player can see. START MATCH unlocks here.

If the world hasn't arrived after 15 seconds, the log says so (usually a cold start still loading). After 60 seconds it says to tap Retry. **Retry** starts over from a fresh token.

## Troubleshooting

| The log says | What it means | What to do |
| --- | --- | --- |
| `Couldn't get an ID token: …` | Firebase Auth on the phone couldn't produce a token (offline, or the account was signed out) | Check the connection; sign out and in |
| `Couldn't connect: … UnknownHostException` / `SSLHandshakeException` | The phone can't reach or trust the server's address | Check the network; for a local server, the debug build's `gameServerUrl` |
| `Couldn't connect: timeout` then retries | The server didn't answer in 20 s: a slow cold start, or it's down | Wait for a retry. Check `/api/health` and the Cloud Run logs for a `[startup]` error |
| `Server refused the connection: no Firebase ID token in the handshake` | The app connected without a token (a guest build against the live server) | Use a build pointed at the live server with Google sign-in |
| `Server refused the connection: ID token rejected (auth/…)` | The token is expired, revoked, or from another Firebase project | The app retries twice with a fresh token; if it still fails, sign out and in |
| `Couldn't read 'init' from the server …` | The app can't parse the world, a mismatch between app and server versions | Update the app; send the copied log |
| `World received … It doesn't include this player` | The server sent a world without this player: a server bug | Send the copied log and the server's `[connect]` lines |
| Stuck on CONNECTING… with no log errors | Fixed in this version: the menu didn't redraw when the world arrived | Update the app |
