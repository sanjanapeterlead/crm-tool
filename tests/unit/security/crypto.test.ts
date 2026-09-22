import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, isEncrypted } from "@/lib/security/crypto";

const key = randomBytes(32);

describe("integration credential encryption", () => {
  it("round-trips a token", () => {
    const token = "EAAG-long-lived-token/with+symbols==";
    expect(decryptSecret(encryptSecret(token, key), key)).toBe(token);
  });

  it("never stores the plaintext and uses a fresh IV each time", () => {
    const token = "EAAG-secret";
    const a = encryptSecret(token, key);
    const b = encryptSecret(token, key);
    expect(a).not.toContain(token);
    expect(a).not.toBe(b);
    expect(isEncrypted(a)).toBe(true);
  });

  it("passes legacy plaintext rows through so deploys need no data migration", () => {
    expect(isEncrypted("EAAG-legacy")).toBe(false);
    expect(decryptSecret("EAAG-legacy", key)).toBe("EAAG-legacy");
  });

  it("rejects a tampered ciphertext instead of returning garbage", () => {
    const stored = encryptSecret("EAAG-secret", key);
    const parts = stored.split(":");
    parts[parts.length - 1] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join(":"), key)).toThrow();
  });

  it("rejects the wrong key", () => {
    const stored = encryptSecret("EAAG-secret", key);
    expect(() => decryptSecret(stored, randomBytes(32))).toThrow();
  });

  it("rejects a malformed value", () => {
    expect(() => decryptSecret("enc:v1:onlyone", key)).toThrow(/malformed/i);
  });
});
