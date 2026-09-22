"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions/run";
import { recordAudit } from "@/lib/services/audit";
import { getOrganization, updateOrganizationSettings } from "@/lib/services/settings";
import { settingsSchema, type SettingsInput } from "@/lib/validation/settings";

export async function updateSettingsAction(input: SettingsInput): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings." };

  const session = await requireRole(["admin"]);
  const supabase = await createClient();

  return runAction(
    "updateSettings",
    async () => {
      const before = await getOrganization(supabase, session.orgId);
      await updateOrganizationSettings(supabase, session.orgId, parsed.data);

      const changed = (["name", "calendly_booking_url", "timezone"] as const).filter(
        (key) => (before[key] ?? null) !== (parsed.data[key] ?? null)
      );
      if (changed.length > 0) {
        await recordAudit(supabase, {
          orgId: session.orgId,
          actorId: session.user.id,
          action: "settings.updated",
          entityType: "organization",
          entityId: session.orgId,
          summary: `Changed organization ${changed.join(", ")}`,
          metadata: { changed },
        });
      }
    },
    ["/settings", "/leads", "/followups", "/"]
  );
}
