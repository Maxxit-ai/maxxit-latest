import fs from "node:fs/promises";
import path from "node:path";

import { appConfig } from "./config";

export type PersistedSession = {
  access_token: string;
  public_token: string;
  refresh_token?: string;
  user_id: string;
  user_name: string;
  user_shortname: string;
  email: string;
  user_type: string;
  broker: string;
  exchanges: string[];
  products: string[];
  order_types: string[];
  api_key: string;
  login_time: string;
  avatar_url: string;
  meta?: {
    demat_consent?: string;
  };
  stored_at: string;
};

async function ensureSessionDir() {
  await fs.mkdir(path.dirname(appConfig.sessionFile), { recursive: true });
}

export async function readSession(): Promise<PersistedSession | null> {
  try {
    const raw = await fs.readFile(appConfig.sessionFile, "utf8");
    return JSON.parse(raw) as PersistedSession;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function writeSession(session: PersistedSession): Promise<void> {
  await ensureSessionDir();
  await fs.writeFile(appConfig.sessionFile, JSON.stringify(session, null, 2));
}

export async function clearSession(): Promise<void> {
  try {
    await fs.unlink(appConfig.sessionFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
