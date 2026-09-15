"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { updateOrganizationSettings } from "@/lib/services/settings";
import type { ActionResult } from "@/app/(app)/actions";

export async function updateSettingsAction(input: {
  name: string;
  calendly_booking_url: string | null;
}): Promise<ActionResult> {
  const session = await requireRole(["admin"]);
  const supabase = await createClient();

  try {
    await updateOrganizationSettings(supabase, session.orgId, input);
    revalidatePath("/settings");
    revalidatePath("/leads");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save settings." };
  }
}
