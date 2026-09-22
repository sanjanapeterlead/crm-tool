import type { CSSProperties } from "react";
import type { LeadStatus } from "@/lib/types/domain";

/**
 * Color hues for data that has no color of its own in the database (pipeline
 * stages, people). Paired with the `.tone-*` classes in globals.css, which
 * read `--tone-h` and pick lightness/chroma per light/dark mode — so callers
 * only choose a hue, never a light-mode and a dark-mode color.
 */

// Open stages cycle through these by position; won/lost are fixed so they
// always read as good/bad regardless of how an org orders its pipeline.
// Seven, not six: sort_order is usually spaced by 10, and 7 is coprime with
// 10, so a 10/20/30… pipeline still gets a distinct hue per stage.
const STAGE_HUES = [245, 190, 290, 330, 75, 265, 105];
const WON_HUE = 155;
const LOST_HUE = 25;

const PERSON_HUES = [15, 45, 85, 150, 190, 230, 265, 300, 335];

export const TONE_HUE = {
  info: 245,
  violet: 290,
  teal: 190,
  success: WON_HUE,
  warning: 75,
  danger: LOST_HUE,
} as const;

export type ToneName = keyof typeof TONE_HUE;

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function toneStyle(hue: number): CSSProperties {
  return { "--tone-h": hue } as CSSProperties;
}

export function stageHue(
  status: Pick<LeadStatus, "label" | "is_won" | "is_lost"> & { sort_order?: number }
) {
  if (status.is_won) return WON_HUE;
  if (status.is_lost) return LOST_HUE;
  const index = status.sort_order ?? hash(status.label);
  return STAGE_HUES[index % STAGE_HUES.length];
}

export function personHue(name: string) {
  return PERSON_HUES[hash(name.toLowerCase()) % PERSON_HUES.length];
}

export function initials(name: string) {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
