import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getUserConfig, saveUserConfig } from "@/lib/context";
import { unprotectSecret } from "@/lib/secret-crypto";
import { revokeGoogleToken } from "@/lib/youtube-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const current = await getUserConfig(user.id);
  const token = unprotectSecret(current.ytRefreshToken);
  try {
    await revokeGoogleToken(token);
  } catch {
    // Local disconnect still proceeds if Google's revoke endpoint is unavailable.
  }
  const {
    ytRefreshToken: _refresh,
    ytChannelId: _id,
    ytChannelTitle: _title,
    ytChannelHandle: _handle,
    ytChannelThumbnail: _thumb,
    ytConnectedAt: _at,
    ytClientId: _legacyId,
    ytClientSecret: _legacySecret,
    ...rest
  } = current;
  await saveUserConfig(user.id, { ...rest, uploadEnabled: false });
  return NextResponse.json({ ok: true });
}
