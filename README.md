<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/82fadd16-361b-4256-8b13-267ed583105d

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

Locally, with no Firebase configuration, you play as a guest and the world is saved to `saves/world.json` every 30 seconds and on shutdown (set `WORLD_FILE` to use a different path; delete the file to start a fresh world).

In production, players sign in with Google (Firebase Authentication), the client is served from Firebase Hosting, the authoritative game server runs on Cloud Run, and the world is saved in Cloud Firestore. See [docs/DEPLOY.md](docs/DEPLOY.md) for setup and deploy commands, and `.env.example` for every variable.

The game's design soul, and why its systems work the way they do, is in [docs/SOUL.md](docs/SOUL.md).
