"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { WhatsAppApiError } from "@/lib/services/whatsapp";
import * as whatsappService from "@/lib/services/whatsapp";
import type { ActionResult } from "@/app/(app)/actions";

const SETTINGS_PATH = "/settings/integrations/whatsapp";

function revalidateIntegration() {
  revalidatePath(SETTINGS_PATH);
  revalidatePath("/settings");
}

function toMessage(e: unknown): string {
  if (e instanceof WhatsAppApiError && e.isAuthError) {
    return `Meta rejected our access token: ${e.message}. Reconnect WhatsApp.`;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

export async function disconnectWhatsAppAction(): Promise<ActionResult> {
  const session = await requireRole(["admin"]);
  try {
    await whatsappService.disconnect(createAdminClient(), session.orgId);
    revalidateIntegration();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

export async function selectWhatsAppNumberAction(phoneNumberId: string): Promise<ActionResult> {
  const session = await requireRole(["admin"]);
  try {
    await whatsappService.selectActiveNumber(createAdminClient(), session.orgId, phoneNumberId);
    revalidateIntegration();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

export async function syncWhatsAppTemplatesAction(): Promise<ActionResult<{ synced: number }>> {
  const session = await requireRole(["admin"]);
  try {
    const result = await whatsappService.syncTemplates(createAdminClient(), session.orgId);
    revalidateIntegration();
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}
