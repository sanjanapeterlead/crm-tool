/**
 * Default rate-limit ceilings for the unauthenticated, high-cost actions, each
 * overridable through the environment. Production keeps the defaults; an
 * automated test suite that signs up and signs in dozens of times from one
 * address raises them for its own server only (see playwright.config.ts).
 */
export const RATE_LIMIT_ENV = {
  loginPerIp: ["LOGIN_RATE_LIMIT_PER_IP", 30],
  loginPerEmail: ["LOGIN_RATE_LIMIT_PER_EMAIL", 10],
  signupPerIp: ["SIGNUP_RATE_LIMIT_PER_IP", 5],
  resetPerIp: ["RESET_RATE_LIMIT_PER_IP", 10],
  resetPerEmail: ["RESET_RATE_LIMIT_PER_EMAIL", 3],
} as const satisfies Record<string, readonly [string, number]>;

export function rateLimitFor(setting: readonly [string, number]): number {
  const parsed = Number(process.env[setting[0]]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : setting[1];
}
