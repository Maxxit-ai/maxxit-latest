import { KiteConnect, type SessionData } from "kiteconnect";

import { appConfig } from "./config";
import { HttpError } from "./errors";
import { clearSession, readSession, writeSession, type PersistedSession } from "./session-store";

function toPersistedSession(session: SessionData): PersistedSession {
  return {
    ...session,
    stored_at: new Date().toISOString(),
  };
}

export function createKite(accessToken?: string) {
  return new KiteConnect({
    api_key: appConfig.kiteApiKey,
    access_token: accessToken,
  });
}

export async function getStoredSession() {
  return readSession();
}

export async function requireKite() {
  const session = await readSession();

  if (!session?.access_token) {
    throw new HttpError(401, "No active Kite session. Complete /auth/login first.");
  }

  return {
    kite: createKite(session.access_token),
    session,
  };
}

export function getLoginUrl() {
  const kite = createKite();
  return kite.getLoginURL();
}

export async function createSessionFromRequestToken(requestToken: string) {
  const kite = createKite();
  const session = await kite.generateSession(requestToken, appConfig.kiteApiSecret);
  const persisted = toPersistedSession(session);
  await writeSession(persisted);
  return persisted;
}

export async function destroySession() {
  const session = await readSession();

  if (session?.access_token) {
    const kite = createKite(session.access_token);

    try {
      await kite.invalidateAccessToken(session.access_token);
    } catch {
      // Local cleanup still matters even if remote invalidation fails.
    }
  }

  await clearSession();
}
