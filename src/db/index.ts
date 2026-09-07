import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ensureDatabaseSchema } from "./bootstrap";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

// Cloud Postgres providers (Neon, Supabase) require SSL. Local Postgres does not.
const useSsl =
  process.env.DB_SSL === "true" || /sslmode=(require|verify-ca|verify-full)/.test(databaseUrl);

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    // Serverless (Vercel) already isolates invocations; keep pools small.
    max: process.env.VERCEL ? 2 : 10,
    idleTimeoutMillis: 20000,
    // Neon can take several seconds to wake a suspended compute.
    connectionTimeoutMillis: 20000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

// Automatically create missing tables if deploying on a fresh database
ensureDatabaseSchema(pool).catch(() => {});

export const db = drizzle(pool);
