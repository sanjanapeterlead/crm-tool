/**
 * Accent colors a user can pick in the user menu. Each is only a hue: every
 * brand-tinted token in globals.css (primary, ring, sidebar, the faint tint in
 * the neutrals) is computed from `--brand-h`, so one attribute on <html>
 * re-themes the whole app. Persisted in a cookie (not localStorage) so the
 * server renders the right accent on first paint — no flash of indigo.
 */
export const ACCENTS = [
  { id: "indigo", label: "Indigo", hue: 265 },
  { id: "violet", label: "Violet", hue: 295 },
  { id: "blue", label: "Blue", hue: 245 },
  { id: "teal", label: "Teal", hue: 190 },
  { id: "emerald", label: "Emerald", hue: 158 },
  { id: "rose", label: "Rose", hue: 10 },
  { id: "orange", label: "Orange", hue: 45 },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

export const DEFAULT_ACCENT: AccentId = "indigo";
export const ACCENT_COOKIE = "crm-accent";

export function parseAccent(value: string | undefined): AccentId {
  return ACCENTS.some((a) => a.id === value) ? (value as AccentId) : DEFAULT_ACCENT;
}
