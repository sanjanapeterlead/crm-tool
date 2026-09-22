import nextEnv from "@next/env";

// Runs inside each integration worker. Next chooses which .env files to read
// from NODE_ENV, and under NODE_ENV=test (which Vitest sets) it skips
// .env.local — where this project keeps its Supabase keys. Load as
// "development" for the duration of the call, then restore.
const env = process.env as Record<string, string | undefined>;
const previous = env.NODE_ENV;
env.NODE_ENV = "development";
nextEnv.loadEnvConfig(process.cwd(), true);
env.NODE_ENV = previous;
