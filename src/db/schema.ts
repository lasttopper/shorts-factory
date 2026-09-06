import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type StepLog = {
  key: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  mode?: "live" | "simulated";
  detail?: string;
  durationMs?: number;
};

export type CaptionLine = { t0: number; t1: number; text: string };

export type UserConfig = {
  sourceChannelHandle?: string;
  telegramChatId?: string;
  telegramBotToken?: string; // personal bot override; system bot is fallback
  // ytClientId/ytClientSecret remain for backward compatibility. New accounts use
  // the shared OAuth application plus a per-user refresh token.
  ytClientId?: string;
  ytClientSecret?: string;
  ytRefreshToken?: string;
  ytChannelId?: string;
  ytChannelTitle?: string;
  ytChannelHandle?: string;
  ytChannelThumbnail?: string;
  ytConnectedAt?: string;
  uploadEnabled?: boolean;
  openaiApiKey?: string;
  openaiModel?: string;
  shortsPerRun?: number;
  startHour?: number;
  intervalMin?: number;
};

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("member"), // admin | member
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  userId: integer("user_id").primaryKey(),
  config: jsonb("config").$type<UserConfig>().notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sourceVideos = pgTable(
  "source_videos",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().default(0), // 0 = system/shared
    videoId: text("video_id").notNull(),
    title: text("title").notNull(),
    channelTitle: text("channel_title").notNull().default(""),
    thumbnailUrl: text("thumbnail_url").notNull().default(""),
    durationSec: integer("duration_sec").notNull().default(0),
    publishedAt: text("published_at").notNull().default(""),
    status: text("status").notNull().default("new"), // new | used
    usedInRunId: integer("used_in_run_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("source_user_video_unique").on(t.userId, t.videoId)]
);

export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0), // 0 = system/legacy
  status: text("status").notNull().default("running"), // running | success | partial | failed
  mode: text("mode").notNull().default("simulation"), // simulation | live | hybrid
  sourceVideoId: text("source_video_id").notNull().default(""),
  sourceVideoTitle: text("source_video_title").notNull().default(""),
  shortsPlanned: integer("shorts_planned").notNull().default(10),
  shortsScheduled: integer("shorts_scheduled").notNull().default(0),
  steps: jsonb("steps").$type<StepLog[]>().notNull().default([]),
  telegramStatus: text("telegram_status").notNull().default("pending"), // pending | sent | simulated | failed
  reportPath: text("report_path").notNull().default(""),
  error: text("error").notNull().default(""),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
});

export const clips = pgTable("clips", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  idx: integer("idx").notNull(), // 1..10
  sourceVideoId: text("source_video_id").notNull(),
  startSec: integer("start_sec").notNull(),
  endSec: integer("end_sec").notNull(),
  hook: text("hook").notNull().default(""),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  hashtags: text("hashtags").notNull().default(""),
  captions: jsonb("captions").$type<CaptionLine[]>().notNull().default([]),
  thumbnailPath: text("thumbnail_path").notNull().default(""),
  assPath: text("ass_path").notNull().default(""),
  renderCommand: text("render_command").notNull().default(""),
  publishAt: timestamp("publish_at"),
  youtubeVideoId: text("youtube_video_id").notNull().default(""),
  status: text("status").notNull().default("planned"), // planned | rendered | scheduled | simulated
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
