import { NextResponse } from "next/server";
import { startPipeline } from "@/lib/pipeline";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Log in first — every user gets their own pipeline" }, { status: 401 });
    const runId = await startPipeline(user.id);
    return NextResponse.json({ ok: true, runId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
