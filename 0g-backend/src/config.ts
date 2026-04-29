import "dotenv/config";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

export function normalizePrivateKey(privateKey: string): string {
  return privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
}

export function getAuthToken(): string | undefined {
  return process.env.ZG_BACKEND_AUTH_TOKEN;
}
