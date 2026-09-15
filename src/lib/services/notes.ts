import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/auth/session";
import type { NoteFormInput } from "@/lib/validation/note";
import { logActivity } from "@/lib/services/activities";

export async function createNote(
  supabase: SupabaseClient,
  session: SessionContext,
  input: NoteFormInput
) {
  const { data: note, error } = await supabase
    .from("notes")
    .insert({
      org_id: session.orgId,
      lead_id: input.lead_id,
      author_id: session.user.id,
      content: input.content,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create note: ${error.message}`);

  await logActivity(supabase, {
    orgId: session.orgId,
    leadId: input.lead_id,
    actorId: session.user.id,
    type: "note_created",
    title: "Note added",
    description: input.content.length > 140 ? `${input.content.slice(0, 140)}…` : input.content,
  });

  return note;
}
