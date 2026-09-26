# Deploying to Firebase

The game runs as three pieces in one Firebase project:

| Piece | Service | Why |
| --- | --- | --- |
| The client | Firebase Hosting | Static files; Google sign-in popups run on the Firebase domains out of the box |
| Sign-in | Firebase Authentication (Google provider) | Every socket carries a Firebase ID token, and the server verifies it before the player reaches the map |
| The game server | Cloud Run, in the same project | The world is a 10 ticks-per-second authoritative simulation over websockets (workers, turrets, captures, fog). Cloud Functions can't hold that, so the existing server runs as one always-on container |
| The saved world | Cloud Firestore | The server saves the whole world every 30 s and on shutdown (gzipped, split across documents in `worlds/main`) and loads it on start |

Clients never read or write Firestore directly; `firestore.rules` denies everything, and only the server (through the Admin SDK) touches it. That's what keeps fog and anti-cheat real.

## One-time setup

You need the [Firebase CLI](https://firebase.google.com/docs/cli) (`npm i -g firebase-tools`) and the [gcloud CLI](https://cloud.google.com/sdk/docs/install), both logged in as you.

1. **Create the project.** Done: `infiniterts-6c5ab` (project number `346111674521`). `.firebaserc` points the Firebase CLI at it.
2. **Upgrade to Blaze.** Cloud Run needs the pay-as-you-go plan. One small always-on instance is the main cost.
3. **Enable Google sign-in.** Authentication → Sign-in method → Google → Enable. The `*.web.app` and `*.firebaseapp.com` domains are authorized by default. Add any custom domain under Authentication → Settings → Authorized domains.
4. **Create the database.** Firestore Database → Create database → Native mode, in a region near your Cloud Run region.
5. **Register a web app.** Done. Its config is committed in `.env.production`; these values are public identifiers, not secrets. Put any overrides in `.env.production.local`.
6. **Point the CLIs at the project:**
   ```sh
   export PROJECT=infiniterts-6c5ab
   gcloud config set project "$PROJECT"
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com
   ```
7. **Let the server write Firestore.** Cloud Run runs as the Compute Engine default service account. If your project doesn't give it Editor, grant it Firestore access:
   ```sh
   NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
   gcloud projects add-iam-policy-binding "$PROJECT" \
     --member="serviceAccount:$NUMBER-compute@developer.gserviceaccount.com" --role=roles/datastore.user
   ```

## Deploy the game server (Cloud Run)

```sh
gcloud run deploy infinite-rts-server --source . --region us-central1 \
  --allow-unauthenticated \
  --min-instances 1 --max-instances 1 --no-cpu-throttling \
  --session-affinity --timeout 3600 --memory 1Gi \
  --set-env-vars "^@^FIREBASE_PROJECT_ID=$PROJECT@ALLOWED_ORIGINS=https://$PROJECT.web.app,https://$PROJECT.firebaseapp.com"
```

Why those flags:

* **`--max-instances 1`:** the world lives in one process's memory. A second instance would be a second, disconnected world.
* **`--min-instances 1 --no-cpu-throttling`:** the world keeps running while nobody is connected (workers mine, turrets fire, and absent players get an away report). Without these flags, Cloud Run freezes the simulation between requests.
* **`--session-affinity --timeout 3600`:** websockets stay on the instance for up to an hour, and Socket.IO reconnects on its own after that.
* **`--allow-unauthenticated`:** the service is public at the HTTP level; players are authenticated per socket by their Firebase ID token.

It should print `https://infinite-rts-server-346111674521.us-central1.run.app`, which is the URL already set as `VITE_GAME_SERVER_URL` in `.env.production`. If you change the service name or region, or it prints a different URL, put that URL in `.env.production.local` before building the client.

## Deploy the client and rules (Firebase Hosting)

```sh
npm ci
npm run build:client
firebase deploy --only hosting,firestore:rules
```

Open https://infiniterts-6c5ab.web.app, sign in with Google, and you're on the map.

## Redeploying

* **Server changes:** rerun the `gcloud run deploy` command. On SIGTERM the server saves the world before it exits, and the new revision loads it.
* **Client changes:** `npm run build:client && firebase deploy --only hosting`.

## Local development

`npm run dev` still works without any of this. With no `FIREBASE_PROJECT_ID`, the server accepts guest ids and saves to `saves/world.json`. With no `VITE_FIREBASE_*` variables, the dev client plays as a local guest.

To test real sign-in locally (`localhost` is an authorized domain by default), copy the four `VITE_FIREBASE_*` lines from `.env.production` into `.env.local`, leaving out `VITE_GAME_SERVER_URL` because the dev server serves the client itself. Then start the server with `FIREBASE_PROJECT_ID=infiniterts-6c5ab npm run dev`. To keep using a local save file while doing that, add `WORLD_STORE=file`.

A production server (`NODE_ENV=production`) refuses to start without `FIREBASE_PROJECT_ID`, and a production client build without the Firebase config shows a "Sign-in is not configured" screen instead of the game.
