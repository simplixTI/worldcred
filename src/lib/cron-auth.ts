import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export function cronAuthorized(req: Request): boolean {
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  const expected = env.cronSecret;
  const a = Buffer.from(token), b = Buffer.from(expected);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
