import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { UserError } from "@/lib/domain/errors";
import { logger } from "@/lib/observability/logger";

/** Every server action returns this; components branch on `.ok`, never on a thrown error. */
export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Runs a server-action body with the app's standard error contract:
 *  - `UserError` → its message is shown to the user as-is;
 *  - Next's own control-flow throws (redirect, notFound) pass through untouched;
 *  - anything else is logged with detail and the user gets a generic message.
 * On success, the listed paths are revalidated.
 *
 * Resolve the session *before* calling this (`requireSession()` redirects by
 * throwing, which is fine outside but should not be reported as a failure).
 */
export async function runAction<T = void>(
  name: string,
  body: () => Promise<T>,
  revalidate: string[] = []
): Promise<ActionResult<T>> {
  try {
    const data = await body();
    for (const path of revalidate) revalidatePath(path);
    return data === undefined ? { ok: true } : { ok: true, data };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof UserError) return { ok: false, error: error.message };
    logger.error(`action.${name}.failed`, { error });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Paths that show a lead or anything hanging off it. */
export function leadPaths(leadId?: string): string[] {
  return ["/leads", ...(leadId ? [`/leads/${leadId}`] : []), "/pipeline", "/followups", "/meetings", "/"];
}
