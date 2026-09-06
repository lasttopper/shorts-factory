import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { getEnv } from "./env";

const PREFIX = "enc:v1:";

function key(): Buffer {
  return createHash("sha256")
    .update(getEnv("AUTH_SECRET") || "shorts-factory-dev-secret-change-me")
    .digest();
}

/** Encrypts a per-user secret before it is stored in PostgreSQL JSON. */
export function protectSecret(value: string): string {
  if (!value || value.startsWith(PREFIX)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

/** Decrypts protected values; returns legacy plaintext unchanged. */
export function unprotectSecret(value?: string): string {
  if (!value) return "";
  if (!value.startsWith(PREFIX)) return value;
  try {
    const [iv64, tag64, body64] = value.slice(PREFIX.length).split(".");
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv64, "base64url"));
    decipher.setAuthTag(Buffer.from(tag64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(body64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}
