import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getEnv } from "./env";

const COOKIE = "sf_session";
const secret = () => getEnv("AUTH_SECRET") || "shorts-factory-dev-secret-change-me";

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "member";
};

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
  const expected = Buffer.from(sign(payload));
  const supplied = Buffer.from(parts[2]);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  const age = Date.now() - parseInt(parts[1], 10);
  if (!Number.isFinite(age) || age > 1000 * 60 * 60 * 24 * 30) return null;
  const id = parseInt(parts[0], 10);
  return Number.isFinite(id) ? id : null;
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

/**
 * Returns the signed-in user. For upgrades from older deployments, if no admin
 * exists, the oldest account is promoted automatically.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const token = store.get(COOKIE)?.value;
    const userId = readSessionToken(token);
    if (!userId) return null;

    let [u] = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, userId));
    if (!u) return null;

    if (u.role !== "admin") {
      const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
      if (!admins.length) {
        const [oldest] = await db.select({ id: users.id }).from(users).orderBy(asc(users.id)).limit(1);
        if (oldest?.id === u.id) {
          await db.update(users).set({ role: "admin" }).where(eq(users.id, u.id));
          u = { ...u, role: "admin" };
        }
      }
    }

    return { ...u, role: u.role === "admin" ? "admin" : "member" };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw Object.assign(new Error("UNAUTHORIZED"), { code: 401 });
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") throw Object.assign(new Error("FORBIDDEN"), { code: 403 });
  return u;
}
