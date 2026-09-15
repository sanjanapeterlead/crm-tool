import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getOrganization(supabase: SupabaseClient, orgId: string) {
  const { data, error } = await supabase.from("organizations").select("*").eq("id", orgId).single();
  if (error) throw new Error(`Failed to load organization: ${error.message}`);
  return data;
}

export async function updateOrganizationSettings(
  supabase: SupabaseClient,
  orgId: string,
  input: { name?: string; calendly_booking_url?: string | null }
) {
  const { error } = await supabase.from("organizations").update(input).eq("id", orgId);
  if (error) throw new Error(`Failed to update organization: ${error.message}`);
}
