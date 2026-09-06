import { NextResponse } from "next/server";
import { memoryPathFor, readMemory } from "@/lib/memory";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const mem = readMemory(memoryPathFor(user.id));
  return NextResponse.json(mem);
}
