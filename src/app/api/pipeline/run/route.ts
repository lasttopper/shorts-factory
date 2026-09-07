import { NextResponse } from "next/server";
import { executeRun } from "@/lib/pipeline";
import { getSessionUser } from "@/lib/auth";
import { ctxForUser } from "@/lib/context";
import { db, pool } from "@/db";
import { runs } from "@/db/schema";
import { ensureDatabaseSchema } from "@/db/bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Quick liveness probe so deployments can be verified without auth: curl /api/pipeline/run */
export async function GET() {
  return NextResponse.json({ ok: true, service: "pipeline", note: "POST (authenticated) starts a run" });
}

async function getAfter(): Promise<((fn: () => Promise<void>) => void) | null> {
  try {
    const mod: any = await (Function('return import("next/server")')() as Promise<any>);
    return typeof mod.after === "function" ? mod.after : null;
  } catch {
    return null;
  }
}

export async function POST() {
  try {
    await ensureDatabaseSchema(pool);
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Please log in first — every user gets their own pipeline." }, { status: 401 });
    }

    const ctx = await ctxForUser(user.id);
    const [r] = await db.insert(runs).values({ status: "running", userId: user.id }).returning({ id: runs.id });
    console.error(`[pipeline] run #${r.id} inserted for user ${user.id} — starting background execution`);

    const work = async () => {
      try {
        await executeRun(r.id, ctx);
        console.error(`[pipeline] run #${r.id} finished`);
      } catch (err: any) {
        console.error(`[pipeline] run #${r.id} background failure:`, err?.stack || err?.message || err);
      }
    };

    // Prefer Next's official background hook; fall back to a plain detached
    // promise (fine on persistent hosts) if it is unavailable on this platform.
    const afterFn = await getAfter();
    try {
      if (afterFn) afterFn(work);
      else work().catch(() => {});
    } catch (e: any) {
      console.error("[pipeline] after() unavailable, using detached promise:", e?.message);
      work().catch(() => {});
    }

    return NextResponse.json({ ok: true, runId: r.id });
  } catch (e: any) {
    console.error("/api/pipeline/run failed:", e?.stack || e);
    return NextResponse.json(
      { ok: false, error: `start failed: ${e?.message?.slice(0, 220) ?? "unknown"}`, runId: null },
      { status: 500 }
    );
  }
}
