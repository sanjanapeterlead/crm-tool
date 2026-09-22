/**
 * Opportunity (a `leads` row — DECISIONS D-002) rules that don't need I/O.
 * Stage *semantics* are flags on the stage, never its label, because labels
 * are per-org data ("Won" might be "Enrolled").
 */

export interface StageFlags {
  is_won: boolean;
  is_lost: boolean;
}

export type OpportunityStatus = "open" | "won" | "lost";

export const OPPORTUNITY_PRIORITIES = ["low", "medium", "high"] as const;
export type OpportunityPriority = (typeof OPPORTUNITY_PRIORITIES)[number];

export function statusForStage(stage: StageFlags): OpportunityStatus {
  if (stage.is_won) return "won";
  if (stage.is_lost) return "lost";
  return "open";
}

export const LOST_REASONS = [
  "Not interested",
  "Wrong number",
  "Price too high",
  "Chose a competitor",
  "No response",
  "Not a fit",
  "Other",
] as const;

export type StageMoveCheck = { ok: true; lostReason: string | null } | { ok: false; error: string };

/**
 * Moving into a lost stage needs a reason (it's what makes "why do we lose
 * leads" answerable); leaving it clears the reason so a revived lead doesn't
 * carry a stale one.
 */
export function checkStageMove(toStage: StageFlags, lostReason?: string | null): StageMoveCheck {
  if (!toStage.is_lost) return { ok: true, lostReason: null };

  const reason = lostReason?.trim();
  if (!reason) return { ok: false, error: "Select a reason before marking this lead lost." };
  return { ok: true, lostReason: reason };
}
