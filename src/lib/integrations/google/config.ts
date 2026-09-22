import "server-only";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  appUrl: string;
}

/** `events` scope: create and edit events — not read the org's whole calendar. */
export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

function readAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/** Null when Google isn't configured, so Settings can say what's missing instead of the app crashing. */
export function getGoogleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, appUrl: readAppUrl() };
}

export function requireGoogleConfig(): GoogleConfig {
  const config = getGoogleConfig();
  if (!config) throw new Error("Google Calendar is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  return config;
}

export function getGoogleRedirectUri(config: GoogleConfig): string {
  return `${config.appUrl}/api/integrations/google/callback`;
}
