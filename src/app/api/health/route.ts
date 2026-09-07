import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const urlSet = !!process.env.DATABASE_URL;
  try {
    await db.execute(sql`select 1 as up`);
    return Response.json({ ok: true, db: "up", databaseUrlConfigured: urlSet });
  } catch (e: any) {
    return Response.json(
      {
        ok: false,
        db: "down",
        databaseUrlConfigured: urlSet,
        detail: e?.message?.slice(0, 300) ?? "connection failed",
        hint: urlSet
          ? "DATABASE_URL is set but the database rejected the connection — check the host, password and that sslmode=require is included."
          : "DATABASE_URL is missing — add the Neon pooled connection string to your host's environment variables.",
      },
      { status: 500 }
    );
  }
}
