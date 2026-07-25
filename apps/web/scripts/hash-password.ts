import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/lib/auth/password";

/**
 * Generates the two secrets the auth gate needs.
 *
 *   pnpm --filter @nobet/web auth:hash "my-admin-password"
 *
 * Prints values for ADMIN_PASSWORD_HASH and a fresh AUTH_SECRET. The password
 * itself is never written to disk — only its scrypt hash.
 */
async function main(): Promise<void> {
  const password = process.argv[2];

  if (!password) {
    console.error('Usage: pnpm --filter @nobet/web auth:hash "<password>"');
    process.exit(1);
  }

  if (password.length < 12) {
    console.error("Refusing to hash: password must be at least 12 characters.");
    process.exit(1);
  }

  const hash = await hashPassword(password);
  const secret = randomBytes(48).toString("base64url");

  console.log("\nAdd these to apps/web/.env (and to your deployment secrets):\n");
  console.log(`AUTH_SECRET="${secret}"`);
  console.log(`ADMIN_PASSWORD_HASH="${hash}"`);
  console.log(
    "\nKeep AUTH_SECRET stable across restarts — changing it invalidates every active session.\n"
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
