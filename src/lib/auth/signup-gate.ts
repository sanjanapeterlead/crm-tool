/**
 * Whether anyone may create a brand-new organization at /signup (DECISIONS
 * D-018). Open by default — this is a SaaS — but a design-partner pilot can set
 * `SIGNUP_ENABLED=false` to close public sign-up while keeping invites working.
 */
export function signupEnabled(): boolean {
  return process.env.SIGNUP_ENABLED !== "false";
}
