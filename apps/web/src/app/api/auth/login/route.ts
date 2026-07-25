import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE,
  createSessionToken,
  isAuthConfigured,
  sessionCookieOptions,
} from "@/lib/auth/session";

/** scrypt is Node-only; this handler must not run on the Edge runtime. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  password: z.string().min(1).max(512),
});

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

interface AttemptRecord {
  count: number;
  resetAt: number;
}

/**
 * Per-process, in-memory throttle. Adequate for the current single-container
 * deployment; move to Redis if the app is ever scaled horizontally.
 */
const attempts = new Map<string, AttemptRecord>();

function clientKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }

  return req.headers.get("x-real-ip") ?? "unknown";
}

function pruneExpired(now: number): void {
  for (const [key, record] of attempts) {
    if (record.resetAt <= now) {
      attempts.delete(key);
    }
  }
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  pruneExpired(now);

  const record = attempts.get(key);

  return record !== undefined && record.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || record.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  attempts.set(key, { count: record.count + 1, resetAt: record.resetAt });
}

export async function POST(req: NextRequest) {
  try {
    const passwordHash = process.env.ADMIN_PASSWORD_HASH;

    if (!isAuthConfigured() || !passwordHash) {
      console.error(
        "[POST /api/auth/login] AUTH_SECRET and/or ADMIN_PASSWORD_HASH is not configured"
      );

      return NextResponse.json(
        {
          error: {
            code: "AUTH_NOT_CONFIGURED",
            message: "Authentication is not configured on this server",
          },
        },
        { status: 503 }
      );
    }

    const key = clientKey(req);

    if (isRateLimited(key)) {
      return NextResponse.json(
        { error: { code: "TOO_MANY_REQUESTS", message: "Too many attempts, try again later" } },
        { status: 429 }
      );
    }

    const parsed = LoginSchema.safeParse(await req.json());

    if (!parsed.success) {
      recordFailure(key);

      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid credentials" } },
        { status: 400 }
      );
    }

    const valid = await verifyPassword(parsed.data.password, passwordHash);

    if (!valid) {
      recordFailure(key);

      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" } },
        { status: 401 }
      );
    }

    attempts.delete(key);

    const token = await createSessionToken({ sub: "admin", role: "ADMIN" });
    const response = NextResponse.json({ success: true });

    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());

    return response;
  } catch (err) {
    console.error("[POST /api/auth/login]", err);

    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
