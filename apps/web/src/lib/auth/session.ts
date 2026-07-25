import { SignJWT, jwtVerify } from "jose";

/**
 * Edge-safe session helpers.
 *
 * This module is imported by `middleware.ts`, so it MUST NOT depend on any
 * Node-only API (`node:crypto`, `fs`, Prisma, ...). Password hashing lives in
 * `./password.ts`, which is Node-only and used exclusively by route handlers.
 */

export const SESSION_COOKIE = "nobet_session";

/** Session lifetime in seconds (7 days). */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

const ISSUER = "nobet-cizelgesi";
const AUDIENCE = "nobet-web";
const MIN_SECRET_LENGTH = 32;

export type SessionRole = "ADMIN";

export interface SessionPayload {
  /** Subject — the authenticated principal. Single-admin for now. */
  sub: string;
  role: SessionRole;
}

function readSecret(): string | null {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    return null;
  }

  return secret;
}

/**
 * True when `AUTH_SECRET` is present and long enough to sign sessions.
 *
 * Callers must fail CLOSED when this returns false: a missing secret means no
 * session can be trusted, so every request has to be rejected.
 */
export function isAuthConfigured(): boolean {
  return readSecret() !== null;
}

function encodedSecret(): Uint8Array {
  const secret = readSecret();

  if (!secret) {
    throw new Error(
      `AUTH_SECRET is not configured (expected at least ${MIN_SECRET_LENGTH} characters)`
    );
  }

  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(encodedSecret());
}

/**
 * Verifies a session token. Returns `null` for any failure (missing token,
 * bad signature, expired, wrong issuer/audience, unconfigured secret) so that
 * callers only ever see "valid session" or "no session".
 */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token || !isAuthConfigured()) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, encodedSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });

    if (typeof payload.sub !== "string" || payload.role !== "ADMIN") {
      return null;
    }

    return { sub: payload.sub, role: "ADMIN" };
  } catch {
    return null;
  }
}

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
}

/**
 * Cookie attributes for the session.
 *
 * `sameSite: "lax"` is what stops cross-site POSTs (including the
 * `multipart/form-data` template upload, which is CORS-simple and therefore
 * preflight-free) from carrying the session — i.e. it is the CSRF defence.
 */
export function sessionCookieOptions(maxAge: number = SESSION_MAX_AGE): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
