import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies Meta's `X-Hub-Signature-256` header against the raw request body.
 *
 * This is the only thing standing between the webhook endpoint and anyone on
 * the internet writing leads into the CRM, so the body must be the exact bytes
 * Meta sent — verify before parsing JSON, never re-serialize.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader) return false;

  const [algorithm, signature] = signatureHeader.split("=");
  if (algorithm !== "sha256" || !signature) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();

  let received: Buffer;
  try {
    received = Buffer.from(signature, "hex");
  } catch {
    return false;
  }

  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

/**
 * `appsecret_proof` for outbound Graph API calls: proves the call comes from
 * our server and not from someone who merely stole an access token.
 */
export function appSecretProof(accessToken: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(accessToken, "utf8").digest("hex");
}
