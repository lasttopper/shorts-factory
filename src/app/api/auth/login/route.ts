import { NextResponse } from "next/server";
import { db, pool } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, SESSION_OPTS, makeSessionToken, verifyPassword } from "@/lib/auth";
import { ensureDatabaseSchema } from "@/db/bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureDatabaseSchema(pool);
    const { email, password } = await req.json().catch(() => ({}));
    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Email and password required" }, { status: 400 });
    }
    const cleanEmail = String(email).toLowerCase().trim();
    const [u] = await db.select().from(users).where(eq(users.email, cleanEmail));
    if (!u) {
      return NextResponse.json({ ok: false, error: "Account not found. Please create an account first." }, { status: 401 });
    }
    if (!verifyPassword(password, u.passwordHash)) {
      return NextResponse.json({ ok: false, error: "Incorrect password. Please try again." }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
    res.cookies.set(SESSION_COOKIE, makeSessionToken(u.id), SESSION_OPTS);
    return res;
  } catch (err: any) {
    console.error("Login error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Login failed" }, { status: 500 });
  }
}
