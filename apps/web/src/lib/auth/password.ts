import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Node-only password hashing. Must never be imported from `middleware.ts`
 * (the Edge runtime has no `node:crypto` scrypt) — see `./session.ts`.
 */

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

const ALGORITHM = "scrypt";
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** OWASP-recommended scrypt parameters (N=2^14, r=8, p=1). */
const PARAMS = { N: 16384, r: 8, p: 1 } as const;

/** scrypt needs roughly 128 * N * r bytes; give it headroom over the 32MB default. */
const MAX_MEM = 128 * PARAMS.N * PARAMS.r * 2;

/**
 * Field separator for the encoded hash.
 *
 * Deliberately NOT the conventional `$` of the PHC string format: this value
 * is carried in `.env`, and dotenv expands `$name` references, which silently
 * mangles `scrypt$16384$8$1$...` into `scrypt6384`. `:` is never produced by
 * the hex encoding, so it round-trips through every config mechanism intact.
 */
const SEPARATOR = ":";

/**
 * Encoded as `scrypt:<N>:<r>:<p>:<saltHex>:<hashHex>` so the work factor
 * travels with the hash and can be raised later without invalidating old ones.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEM });

  return [
    ALGORITHM,
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join(SEPARATOR);
}

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split(SEPARATOR);

  if (parts.length !== 6 || parts[0] !== ALGORITHM) {
    return null;
  }

  const [, rawN, rawR, rawP, saltHex, hashHex] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return null;
  }

  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) {
    return null;
  }

  return {
    N,
    r,
    p,
    salt: Buffer.from(saltHex, "hex"),
    hash: Buffer.from(hashHex, "hex"),
  };
}

/**
 * Constant-time verification. Returns false — never throws — for malformed
 * stored hashes so a bad `ADMIN_PASSWORD_HASH` cannot be distinguished from a
 * wrong password by timing or by error shape.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);

  if (!parsed) {
    return false;
  }

  try {
    const derived = await scrypt(password, parsed.salt, parsed.hash.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: 128 * parsed.N * parsed.r * 2,
    });

    return derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash);
  } catch {
    return false;
  }
}
