import { NextResponse } from "next/server";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ runs: [] });
  const rows = await db.select().from(runs).where(eq(runs.userId, user.id)).orderBy(desc(runs.id)).limit(25);
  return NextResponse.json({ runs: rows });
}
