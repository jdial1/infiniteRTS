// Firebase on the client: Google sign-in, and the address of the game server.
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId);
const auth = firebaseConfigured ? getAuth(initializeApp(config)) : null;

// Without a Firebase config, local development plays as a guest (the dev server accepts it).
// A production build without one can't sign anybody in, and says so.
export const guestModeAllowed = !firebaseConfigured && import.meta.env.DEV;

// The Firebase Hosting site serves the client; the game server runs on Cloud Run
export const GAME_SERVER_URL: string = import.meta.env.VITE_GAME_SERVER_URL || '/';

export interface Session {
  uid: string;
  displayName: string | null;
  guest: boolean;
  getToken: () => Promise<string | null>;
}

function guestSession(): Session {
  let uid = localStorage.getItem('render_game_user_id');
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem('render_game_user_id', uid);
  }
  return { uid, displayName: null, guest: true, getToken: async () => null };
}

// Calls back with the session (or null when signed out) now and whenever it changes
export function watchSession(cb: (s: Session | null) => void): () => void {
  if (!auth) {
    cb(guestModeAllowed ? guestSession() : null);
    return () => {};
  }
  return onAuthStateChanged(auth, user => {
    cb(user ? { uid: user.uid, displayName: user.displayName, guest: false, getToken: () => user.getIdToken() } : null);
  });
}

export async function signInWithGoogle() {
  if (!auth) throw new Error('Sign-in is not configured');
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signOutUser() {
  if (auth) await signOut(auth);
}
