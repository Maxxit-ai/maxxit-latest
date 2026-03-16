import path from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  KITE_API_KEY: z.string().min(1, "KITE_API_KEY is required"),
  KITE_API_SECRET: z.string().min(1, "KITE_API_SECRET is required"),
  KITE_REDIRECT_URL: z.string().url("KITE_REDIRECT_URL must be a valid URL"),
  SESSION_FILE: z.string().default(".data/session.json"),
});

const env = envSchema.parse(process.env);

export const appConfig = {
  port: env.PORT,
  kiteApiKey: env.KITE_API_KEY,
  kiteApiSecret: env.KITE_API_SECRET,
  kiteRedirectUrl: env.KITE_REDIRECT_URL,
  sessionFile: path.resolve(process.cwd(), env.SESSION_FILE),
};
