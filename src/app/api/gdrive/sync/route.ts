import { NextResponse } from "next/server";
import { pullFromDrive, pushToDrive } from "@/lib/gdrive";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { direction } = await req.json().catch(() => ({ direction: "push" }));
  const result = direction === "pull" ? await pullFromDrive() : await pushToDrive();
  return NextResponse.json(result);
}
