import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TIMEZONE } from "@/lib/domain/due";

export async function getOrganization(supabase: SupabaseClient, orgId: string) {
  const { data, error } = await supabase.from("organizations").select("*").eq("id", orgId).single();
  if (error) throw new Error(`Failed to load organization: ${error.message}`);
  return data;
}

export async function updateOrganizationSettings(
  supabase: SupabaseClient,
  orgId: string,
  input: { name?: string; calendly_booking_url?: string | null; timezone?: string }
) {
  const { error } = await supabase.from("organizations").update(input).eq("id", orgId);
  if (error) throw new Error(`Failed to update organization: ${error.message}`);
}

/** The org's IANA timezone — "today" and "overdue" are always measured in it. */
export async function getOrgTimezone(supabase: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await supabase.from("organizations").select("timezone").eq("id", orgId).maybeSingle();
  return (data?.timezone as string | undefined) ?? DEFAULT_TIMEZONE;
}
