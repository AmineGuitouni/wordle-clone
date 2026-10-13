import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { rotateTodaysWord } from "@/lib/game/service";

export const dynamic = "force-dynamic";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Accepts the secret as a `key` header or as `Authorization: Bearer <secret>` (what Vercel Cron sends). */
function isAuthorized(req: Request): boolean {
  const secret = process.env.WEBHOOK_SECRET_KEY;
  if (!secret) return false;

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = req.headers.get("key") ?? bearer;
  if (!provided) return false;

  // Hash both sides so the comparison is constant-time regardless of length.
  return timingSafeEqual(sha256(provided), sha256(secret));
}

async function rotate(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await rotateTodaysWord();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to rotate today's word", error);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}

export const POST = rotate;
// Cron services (including Vercel Cron) commonly only issue GET requests, so GET stays supported.
export const GET = rotate;
