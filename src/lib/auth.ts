import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getEnv } from "./env";

const COOKIE = "sf_session";
const secret = () => getEnv("AUTH_SECRET") || "shorts-factory-dev-secret-change-me";

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const cand = scryptSync(pw, salt, 64);
  const ref = Buffer.from(hash, "hex");
  return cand.length === ref.length && timingSafeEqual(cand, ref);
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function makeSessionToken(userId: number): string {
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  if (!timingSafeEqual(Buffer.from(sign(payload)), Buffer.from(parts[2]))) return null;
  const age = Date.now() - parseInt(parts[1], 10);
  if (age > 1000 * 60 * 60 * 24 * 30) return null; // 30 days
  const id = parseInt(parts[0], 10);
  return Number.isFinite(id) ? id : null;
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

export async function getSessionUser(): Promise<{ id: number; name: string; email: string } | null> {
  try {
    const store = await cookies();
    const token = store.get(COOKIE)?.value;
    const userId = readSessionToken(token);
    if (!userId) return null;
    const [u] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, userId));
    return u ?? null;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<{ id: number; name: string; email: string }> {
  const u = await getSessionUser();
  if (!u) throw Object.assign(new Error("UNAUTHORIZED"), { code: 401 });
  return u;
}
