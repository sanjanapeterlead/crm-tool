import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export interface RateLimitRule {
  /** Namespaced, e.g. `signup:ip:203.0.113.7` or `webhook:meta:page:123`. */
  key: string;
  /** Max hits allowed per window. */
  limit: number;
  windowSeconds: number;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Cross-instance fixed-window limiter backed by Postgres (DECISIONS D-010).
 * Serverless functions share no memory, so an in-process counter would let a
 * flood through in proportion to how many instances spin up.
 *
 * Fails OPEN by default: if the limiter's own database call errors, a real
 * webhook or sign-in is let through and the failure is logged, because
 * dropping a customer's lead to defend against a flood that may not exist is
 * the worse trade. Pass `failOpen: false` for endpoints where an outage of the
 * limiter must not become an open door (signup).
 */
export async function checkRateLimit(
  admin: SupabaseClient,
  rule: RateLimitRule,
  options: { failOpen?: boolean } = {}
): Promise<RateLimitResult> {
  const failOpen = options.failOpen ?? true;

  const { data, error } = await admin.rpc("rate_limit_hit", {
    p_key: rule.key,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });

  if (error) {
    logger.error("rate_limit.check_failed", { key: rule.key, error: error.message });
    return failOpen ? { allowed: true } : { allowed: false, retryAfterSeconds: rule.windowSeconds };
  }

  if (data === true) return { allowed: true };
  // Fixed window: the honest upper bound on the wait is the window length.
  return { allowed: false, retryAfterSeconds: rule.windowSeconds };
}

/**
 * Best-effort client address for a rate-limit key. Behind a trusted proxy
 * (Vercel, a load balancer) the left-most `x-forwarded-for` entry is the
 * client; it can be spoofed by a client talking to us directly, so treat it as
 * a coarse bucket, never as identity.
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}

export function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response("Too many requests", {
    status: 429,
    headers: { "retry-after": String(retryAfterSeconds) },
  });
}
