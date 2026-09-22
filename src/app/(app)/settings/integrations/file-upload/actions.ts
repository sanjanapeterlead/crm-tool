"use server";

import { requireRole } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions/run";
import { FILE_IMPORT_MAX_BYTES, importLeadsFromCsv, type FileImportSummary } from "@/lib/services/file-import";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function importLeadsFileAction(formData: FormData): Promise<ActionResult<FileImportSummary>> {
  const session = await requireRole(["admin"]);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV file to upload." };
  if (file.size > FILE_IMPORT_MAX_BYTES) {
    return { ok: false, error: `That file is too large. Keep it under ${FILE_IMPORT_MAX_BYTES / (1024 * 1024)} MB.` };
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith(".csv") && !name.endsWith(".tsv") && !name.endsWith(".txt")) {
    return { ok: false, error: "Upload a .csv, .tsv or .txt file." };
  }

  const text = await file.text();
  const db = await createClient();
  const admin = createAdminClient();

  return runAction(
    "importLeadsFile",
    () =>
      importLeadsFromCsv(
        { db, admin },
        { orgId: session.orgId, userId: session.user.id, role: session.role },
        text,
        file.name
      ),
    ["/settings/integrations", "/leads", "/pipeline", "/followups", "/"]
  );
}
