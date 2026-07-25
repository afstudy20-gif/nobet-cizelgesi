import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../password";

const PASSWORD = "correct horse battery staple";

describe("hashPassword / verifyPassword", () => {
  it("accepts the password it was derived from", async () => {
    const hash = await hashPassword(PASSWORD);

    await expect(verifyPassword(PASSWORD, hash)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword(PASSWORD);

    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
    await expect(verifyPassword("", hash)).resolves.toBe(false);
    await expect(verifyPassword(`${PASSWORD} `, hash)).resolves.toBe(false);
  });

  it("salts each hash, so the same password never encodes identically", async () => {
    const [first, second] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);

    expect(first).not.toBe(second);
    await expect(verifyPassword(PASSWORD, first)).resolves.toBe(true);
    await expect(verifyPassword(PASSWORD, second)).resolves.toBe(true);
  });

  /**
   * Regression guard.
   *
   * The encoded hash is stored in `ADMIN_PASSWORD_HASH`, and dotenv expands
   * `$name` references when loading `.env`. A PHC-style `scrypt$16384$8$1$...`
   * encoding was silently rewritten to `scrypt6384` before it ever reached
   * `verifyPassword`, which made every login fail with a valid password.
   * Keep the encoding free of characters that config loaders interpret.
   */
  it("encodes without characters that .env loaders expand", async () => {
    const hash = await hashPassword(PASSWORD);

    expect(hash).not.toContain("$");
    expect(hash).not.toContain("\\");
    expect(hash).not.toContain('"');
    expect(hash).toMatch(/^scrypt:\d+:\d+:\d+:[0-9a-f]+:[0-9a-f]+$/);
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    const malformed = [
      "",
      "not-a-hash",
      "scrypt:16384:8:1",
      "scrypt:16384:8:1:nothex:nothex",
      "bcrypt:16384:8:1:aa:bb",
      // The pre-fix encoding, and what dotenv turned it into.
      "scrypt$16384$8$1$aabb$ccdd",
      "scrypt6384",
    ];

    for (const stored of malformed) {
      await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(false);
    }
  });
});
