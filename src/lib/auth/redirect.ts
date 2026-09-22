/**
 * Sanitizes a post-login redirect target. The login page accepts `?redirectTo=`
 * so a user bounced from a deep link lands back on it — but taken raw, that's
 * an open redirect: `/login?redirectTo=https://evil.example` would send a
 * freshly authenticated user (and a convincing "you're logged in" moment) to an
 * attacker's site. Only same-origin absolute *paths* are allowed.
 */
export function safeRedirectPath(input: string | null | undefined, fallback = "/"): string {
  if (!input) return fallback;

  // Must start with exactly one slash: not a scheme ("https:", "javascript:"),
  // not protocol-relative ("//host"), and no backslashes, which browsers treat
  // like slashes ("/\host") — nor control characters that can smuggle any of it.
  if (!input.startsWith("/") || input.startsWith("//")) return fallback;
  if (input.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(input)) return fallback;

  return input;
}
