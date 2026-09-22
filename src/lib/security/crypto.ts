import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-level encryption for integration credentials (DECISIONS D-009).
 *
 * The token tables are already unreadable to clients (RLS with no policies,
 * privileges revoked). This protects against the other leaks: a database
 * dump, a backup, or a leaked service-role key.
 *
 * Stored format: `enc:v1:<iv>:<authTag>:<ciphertext>` (base64url parts). The
 * version segment lets a future key/algorithm rotate while old rows still
 * decrypt. Values without the prefix are treated as legacy plaintext so this
 * ships without a data migration; the next write re-encrypts them.
 */

const PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

// Local development only: lets the encrypt/decrypt path run without setup.
// Never used when NODE_ENV=production.
const DEV_FALLBACK_KEY = Buffer.alloc(KEY_BYTES, "crm-dev-only-insecure-key");

let warnedAboutDevKey = false;

export function getEncryptionKey(): Buffer {
  const encoded = process.env.INTEGRATION_ENCRYPTION_KEY;

  if (!encoded) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "INTEGRATION_ENCRYPTION_KEY is required in production to store integration credentials. " +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
      );
    }
    if (!warnedAboutDevKey) {
      warnedAboutDevKey = true;
      console.warn("[security] INTEGRATION_ENCRYPTION_KEY not set — using an insecure development key.");
    }
    return DEV_FALLBACK_KEY;
  }

  const key = Buffer.from(encoded, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(`INTEGRATION_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (base64 of 32 random bytes).`);
  }
  return key;
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

export function encryptSecret(plaintext: string, key: Buffer = getEncryptionKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

/**
 * Decrypts a stored credential. Throws on tampering or a wrong key (GCM
 * authenticates), which callers should treat as "credential unusable —
 * reconnect", never as a reason to fall back to the raw stored string.
 */
export function decryptSecret(stored: string, key: Buffer = getEncryptionKey()): string {
  if (!isEncrypted(stored)) return stored; // legacy plaintext row

  const [ivPart, tagPart, dataPart] = stored.slice(PREFIX.length).split(":");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Stored credential is malformed.");
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}
