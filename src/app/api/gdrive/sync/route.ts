import { NextResponse } from "next/server";
import { pullFromDrive, pushToDrive } from "@/lib/gdrive";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });
  const { direction } = await req.json().catch(() => ({ direction: "push" }));
  const result = direction === "pull" ? await pullFromDrive(user.id) : await pushToDrive(user.id);
  return NextResponse.json(result);
}
