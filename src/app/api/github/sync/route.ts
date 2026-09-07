import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { pullFromGithub, pushToGithub } from "@/lib/github-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sync this user's memory.md (and latest report) with the GitHub state repo. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { direction, runId } = await req.json().catch(() => ({ direction: "push" }));
  const result =
    direction === "pull" ? await pullFromGithub(user.id) : await pushToGithub(user.id, runId ? Number(runId) : undefined);
  return NextResponse.json(result);
}
