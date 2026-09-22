/**
 * Mock providers (DECISIONS D-017). Every external port has a mock adapter so
 * the product can be demonstrated and tested with no provider credentials.
 *
 * Off by default in production: a WhatsApp message a mock "sent" must never be
 * mistaken for one that was delivered. Turn it on deliberately with
 * `ENABLE_MOCK_PROVIDERS=true` (a demo deployment); turn it off in development
 * with `ENABLE_MOCK_PROVIDERS=false` to exercise only real adapters.
 */
export function mockProvidersEnabled(): boolean {
  const flag = process.env.ENABLE_MOCK_PROVIDERS;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}
