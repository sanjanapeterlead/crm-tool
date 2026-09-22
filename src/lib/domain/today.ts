/**
 * The "Start next lead" rule for a salesperson's Today screen. Pure so the
 * ordering — the thing a rep actually experiences as "what should I do now" —
 * is written down and tested rather than implied by a query's ORDER BY.
 */

export type NextLeadReason = "new_lead" | "overdue_followup" | "followup_today";

export interface NextLeadCandidates {
  /** Assigned to the rep, open, never contacted. `createdAt` orders by how long they've waited. */
  uncontacted: Array<{ leadId: string; createdAt: string }>;
  /** Pending follow-ups whose time has passed. `dueAt` is a sortable timestamp/ISO string. */
  overdue: Array<{ leadId: string; dueAt: string }>;
  /** Pending follow-ups still ahead of us today. */
  dueToday: Array<{ leadId: string; dueAt: string }>;
}

export interface NextLead {
  leadId: string;
  reason: NextLeadReason;
}

/**
 * 1. A lead nobody has contacted — speed-to-lead beats everything for ad
 *    leads, and the longest-waiting one is the most at risk.
 * 2. The most overdue follow-up — a promise already broken.
 * 3. The next follow-up due today, earliest first.
 */
export function chooseNextLead(candidates: NextLeadCandidates): NextLead | null {
  const oldest = <T,>(items: T[], key: (item: T) => string) =>
    items.length === 0 ? null : items.reduce((best, item) => (key(item) < key(best) ? item : best));

  const fresh = oldest(candidates.uncontacted, (c) => c.createdAt);
  if (fresh) return { leadId: fresh.leadId, reason: "new_lead" };

  const late = oldest(candidates.overdue, (c) => c.dueAt);
  if (late) return { leadId: late.leadId, reason: "overdue_followup" };

  const soon = oldest(candidates.dueToday, (c) => c.dueAt);
  if (soon) return { leadId: soon.leadId, reason: "followup_today" };

  return null;
}
