import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, SESSION_OPTS, makeSessionToken, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Email and password required" }, { status: 400 });
  }
  const [u] = await db.select().from(users).where(eq(users.email, String(email).toLowerCase().trim()));
  if (!u || !verifyPassword(password, u.passwordHash)) {
    return NextResponse.json({ ok: false, error: "Invalid email or password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  res.cookies.set(SESSION_COOKIE, makeSessionToken(u.id), SESSION_OPTS);
  return res;
}
