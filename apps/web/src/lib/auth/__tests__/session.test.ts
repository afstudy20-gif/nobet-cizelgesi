import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_COOKIE,
  createSessionToken,
  isAuthConfigured,
  sessionCookieOptions,
  verifySessionToken,
} from "../session";

const SECRET = "a".repeat(48);
const OTHER_SECRET = "b".repeat(48);

const originalSecret = process.env.AUTH_SECRET;

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
});

afterEach(() => {
  process.env.AUTH_SECRET = originalSecret;
  // NODE_ENV is typed read-only, so it is swapped via vitest's env stubbing.
  vi.unstubAllEnvs();
});

describe("isAuthConfigured", () => {
  it("requires a secret of at least 32 characters", () => {
    expect(isAuthConfigured()).toBe(true);

    process.env.AUTH_SECRET = "too-short";
    expect(isAuthConfigured()).toBe(false);

    delete process.env.AUTH_SECRET;
    expect(isAuthConfigured()).toBe(false);
  });
});

describe("createSessionToken / verifySessionToken", () => {
  it("round-trips a session", async () => {
    const token = await createSessionToken({ sub: "admin", role: "ADMIN" });

    await expect(verifySessionToken(token)).resolves.toEqual({ sub: "admin", role: "ADMIN" });
  });

  it("returns null instead of throwing for every rejection path", async () => {
    const token = await createSessionToken({ sub: "admin", role: "ADMIN" });

    await expect(verifySessionToken(undefined)).resolves.toBeNull();
    await expect(verifySessionToken("")).resolves.toBeNull();
    await expect(verifySessionToken("not.a.jwt")).resolves.toBeNull();
    await expect(verifySessionToken(`${token}tampered`)).resolves.toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken({ sub: "admin", role: "ADMIN" });

    process.env.AUTH_SECRET = OTHER_SECRET;
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  /** Fail closed: with no secret configured, no session may be trusted. */
  it("rejects every token when the secret is missing", async () => {
    const token = await createSessionToken({ sub: "admin", role: "ADMIN" });

    delete process.env.AUTH_SECRET;
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const expired = await new SignJWT({ role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("admin")
      .setIssuer("nobet-cizelgesi")
      .setAudience("nobet-web")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(SECRET));

    await expect(verifySessionToken(expired)).resolves.toBeNull();
  });

  it("rejects a correctly signed token issued for a different audience", async () => {
    const foreign = await new SignJWT({ role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("admin")
      .setIssuer("nobet-cizelgesi")
      .setAudience("some-other-app")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));

    await expect(verifySessionToken(foreign)).resolves.toBeNull();
  });

  it("rejects a token without the ADMIN role", async () => {
    const roleless = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("admin")
      .setIssuer("nobet-cizelgesi")
      .setAudience("nobet-web")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));

    await expect(verifySessionToken(roleless)).resolves.toBeNull();
  });
});

describe("sessionCookieOptions", () => {
  it("is httpOnly and SameSite=Lax so the cookie cannot ride cross-site requests", () => {
    const options = sessionCookieOptions();

    expect(SESSION_COOKIE).toBe("nobet_session");
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  it("only sets Secure in production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionCookieOptions().secure).toBe(false);

    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions().secure).toBe(true);
  });
});
