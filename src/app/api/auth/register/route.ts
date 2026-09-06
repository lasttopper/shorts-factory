import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, SESSION_OPTS, hashPassword, makeSessionToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { name, email, password } = await req.json().catch(() => ({}));
  if (!name?.trim() || !email?.trim() || !password || password.length < 4) {
    return NextResponse.json({ ok: false, error: "Name, email and a password (4+ chars) are required" }, { status: 400 });
  }
  const cleanEmail = String(email).toLowerCase().trim();
  const existing = await db.select().from(users).where(eq(users.email, cleanEmail));
  if (existing.length) {
    return NextResponse.json({ ok: false, error: "That email is already registered — log in instead" }, { status: 409 });
  }
  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  const role = admins.length ? "member" : "admin";
  const [u] = await db
    .insert(users)
    .values({ name: String(name).trim(), email: cleanEmail, passwordHash: hashPassword(password), role })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role });
  const res = NextResponse.json({ ok: true, user: u });
  res.cookies.set(SESSION_COOKIE, makeSessionToken(u.id), SESSION_OPTS);
  return res;
}
