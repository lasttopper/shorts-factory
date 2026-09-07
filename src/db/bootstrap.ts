import { Pool } from "pg";

let initPromise: Promise<void> | null = null;

export function ensureDatabaseSchema(pool: Pool): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS user_settings (
            user_id INTEGER PRIMARY KEY,
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS user_memories (
            user_id INTEGER PRIMARY KEY,
            content TEXT NOT NULL DEFAULT '',
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS source_videos (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL DEFAULT 0,
            video_id TEXT NOT NULL,
            title TEXT NOT NULL,
            channel_title TEXT NOT NULL DEFAULT '',
            thumbnail_url TEXT NOT NULL DEFAULT '',
            duration_sec INTEGER NOT NULL DEFAULT 0,
            published_at TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'new',
            used_in_run_id INTEGER,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );
          CREATE UNIQUE INDEX IF NOT EXISTS source_user_video_unique ON source_videos (user_id, video_id);

          CREATE TABLE IF NOT EXISTS runs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'running',
            mode TEXT NOT NULL DEFAULT 'simulation',
            source_video_id TEXT NOT NULL DEFAULT '',
            source_video_title TEXT NOT NULL DEFAULT '',
            shorts_planned INTEGER NOT NULL DEFAULT 10,
            shorts_scheduled INTEGER NOT NULL DEFAULT 0,
            steps JSONB NOT NULL DEFAULT '[]'::jsonb,
            telegram_status TEXT NOT NULL DEFAULT 'pending',
            report_path TEXT NOT NULL DEFAULT '',
            report_b64 TEXT NOT NULL DEFAULT '',
            error TEXT NOT NULL DEFAULT '',
            started_at TIMESTAMP NOT NULL DEFAULT NOW(),
            finished_at TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS clips (
            id SERIAL PRIMARY KEY,
            run_id INTEGER NOT NULL,
            idx INTEGER NOT NULL,
            source_video_id TEXT NOT NULL,
            start_sec INTEGER NOT NULL,
            end_sec INTEGER NOT NULL,
            hook TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            hashtags TEXT NOT NULL DEFAULT '',
            captions JSONB NOT NULL DEFAULT '[]'::jsonb,
            thumbnail_path TEXT NOT NULL DEFAULT '',
            thumbnail_b64 TEXT NOT NULL DEFAULT '',
            ass_path TEXT NOT NULL DEFAULT '',
            ass_content TEXT NOT NULL DEFAULT '',
            render_command TEXT NOT NULL DEFAULT '',
            publish_at TIMESTAMP,
            youtube_video_id TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'planned',
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT '',
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          );

          -- Self-healing migrations for databases created by older app versions:
          -- every non-serial column is added idempotently without touching data.
          ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
          ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';
          ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';
          ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();

          ALTER TABLE source_videos ADD COLUMN IF NOT EXISTS user_id INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE source_videos ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
          ALTER TABLE source_videos ADD COLUMN IF NOT EXISTS channel_title TEXT NOT NULL DEFAULT '';
          ALTER TABLE source_videos ADD COLUMN IF NOT EXISTS thumbnail_url TEXT NOT NULL DEFAULT '';
          ALTER TABLE source_videos ADD COLUMN IF NOT EXISTS duration_sec INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE source_videos ADD COLUMN IF NOT EXISTS published_at TEXT NOT NULL DEFAULT '';
          ALTER TABLE source_videos ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
          ALTER TABLE source_videos ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();

          ALTER TABLE runs ADD COLUMN IF NOT EXISTS user_id INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE runs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'running';
          ALTER TABLE runs ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'simulation';
          ALTER TABLE runs ADD COLUMN IF NOT EXISTS source_video_id TEXT NOT NULL DEFAULT '';
          ALTER TABLE runs ADD COLUMN IF NOT EXISTS source_video_title TEXT NOT NULL DEFAULT '';
          ALTER TABLE runs ADD COLUMN IF NOT EXISTS shorts_planned INTEGER NOT NULL DEFAULT 10;
          ALTER TABLE runs ADD COLUMN IF NOT EXISTS shorts_scheduled INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE runs ADD COLUMN IF NOT EXISTS steps JSONB NOT NULL DEFAULT '[]'::jsonb;
          ALTER TABLE runs ADD COLUMN IF NOT EXISTS telegram_status TEXT NOT NULL DEFAULT 'pending';
          ALTER TABLE runs ADD COLUMN IF NOT EXISTS report_path TEXT NOT NULL DEFAULT '';
          ALTER TABLE runs ADD COLUMN IF NOT EXISTS report_b64 TEXT NOT NULL DEFAULT '';
          ALTER TABLE runs ADD COLUMN IF NOT EXISTS error TEXT NOT NULL DEFAULT '';
          ALTER TABLE runs ADD COLUMN IF NOT EXISTS started_at TIMESTAMP NOT NULL DEFAULT NOW();

          ALTER TABLE clips ADD COLUMN IF NOT EXISTS idx INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE clips ADD COLUMN IF NOT EXISTS source_video_id TEXT NOT NULL DEFAULT '';
          ALTER TABLE clips ADD COLUMN IF NOT EXISTS start_sec INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE clips ADD COLUMN IF NOT EXISTS end_sec INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE clips ADD COLUMN IF NOT EXISTS hook TEXT NOT NULL DEFAULT '';
          ALTER TABLE clips ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
          ALTER TABLE clips ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
          ALTER TABLE clips ADD COLUMN IF NOT EXISTS hashtags TEXT NOT NULL DEFAULT '';
          ALTER TABLE clips ADD COLUMN IF NOT EXISTS captions JSONB NOT NULL DEFAULT '[]'::jsonb;
          ALTER TABLE clips ADD COLUMN IF NOT EXISTS thumbnail_path TEXT NOT NULL DEFAULT '';
          ALTER TABLE clips ADD COLUMN IF NOT EXISTS thumbnail_b64 TEXT NOT NULL DEFAULT '';
          ALTER TABLE clips ADD COLUMN IF NOT EXISTS ass_path TEXT NOT NULL DEFAULT '';
          ALTER TABLE clips ADD COLUMN IF NOT EXISTS ass_content TEXT NOT NULL DEFAULT '';
          ALTER TABLE clips ADD COLUMN IF NOT EXISTS render_command TEXT NOT NULL DEFAULT '';
          ALTER TABLE clips ADD COLUMN IF NOT EXISTS youtube_video_id TEXT NOT NULL DEFAULT '';
          ALTER TABLE clips ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'planned';
          ALTER TABLE clips ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();

          CREATE TABLE IF NOT EXISTS user_settings (
            user_id INTEGER PRIMARY KEY,
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS user_memories (
            user_id INTEGER PRIMARY KEY,
            content TEXT NOT NULL DEFAULT '',
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          );

          CREATE UNIQUE INDEX IF NOT EXISTS source_user_video_unique ON source_videos (user_id, video_id);
        `);
      } catch (err: any) {
        console.error("Auto-schema initialization warning:", err.message);
      } finally {
        client.release();
      }
    })();
  }
  return initPromise;
}
