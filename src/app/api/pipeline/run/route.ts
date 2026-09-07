import { NextResponse, after } from "next/server";
import { executeRun } from "@/lib/pipeline";
import { getSessionUser } from "@/lib/auth";
import { ctxForUser } from "@/lib/context";
import { db } from "@/db";
import { runs } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Please log in first — every user gets their own pipeline." }, { status: 401 });
    }

    const ctx = await ctxForUser(user.id);
    const [r] = await db.insert(runs).values({ status: "running", userId: user.id }).returning({ id: runs.id });

    // In Next.js 15+, after() runs in the background on serverless and persistent hosts alike,
    // allowing the API to return the run ID to the client immediately (< 100ms).
    after(async () => {
      try {
        await executeRun(r.id, ctx);
      } catch (err: any) {
        console.error(`Background execution failed for run #${r.id}:`, err?.message || err);
      }
    });

    return NextResponse.json({ ok: true, runId: r.id });
  } catch (e: any) {
    console.error("Pipeline start error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Failed to start pipeline" }, { status: 500 });
  }
}
