// Who a connection is. With a Firebase project configured, every socket must carry a Google-backed
// Firebase ID token and the player is its uid. Without one, local development trusts a guest id.
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export type IdentifyConnection = (handshakeAuth: any) => Promise<string>;

/** Why a connection was refused. The reason is logged and sent to the app (never the token itself). */
export class AuthRejected extends Error {
  constructor(public reason: string) {
    super('unauthorized');
  }
}

export interface Identifier {
  identify: IdentifyConnection;
  /** How this server decides who a connection is, for logs and the status report. */
  mode: string;
}

export function createIdentifier(): Identifier {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FIREBASE_PROJECT_ID must be set in production: players sign in with Google.');
    }
    console.warn('FIREBASE_PROJECT_ID is not set: accepting unauthenticated guest ids (development only).');
    return {
      mode: 'guest ids (development only)',
      identify: async (auth) => {
        const id = auth?.userId;
        if (typeof id !== 'string' || id.length === 0 || id.length > 128) throw new AuthRejected('no guest id in the handshake');
        return id;
      },
    };
  }
  if (getApps().length === 0) initializeApp({ projectId });
  return {
    mode: `Firebase ID tokens for ${projectId}`,
    identify: async (auth) => {
      const token = auth?.token;
      if (typeof token !== 'string' || token.length === 0) throw new AuthRejected('no Firebase ID token in the handshake');
      try {
        const decoded = await getAuth().verifyIdToken(token);
        return decoded.uid;
      } catch (e: any) {
        // e.g. auth/id-token-expired, auth/argument-error (wrong project), auth/id-token-revoked
        throw new AuthRejected(`ID token rejected (${e?.code || e?.message || 'unknown error'})`);
      }
    },
  };
}
