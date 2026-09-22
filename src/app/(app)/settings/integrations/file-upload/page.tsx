import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { FileUploadImport } from "@/components/crm/integrations/file-upload-import";

export default async function FileUploadImportPage() {
  await requireRole(["admin"]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings/integrations"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Integrations &amp; health
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Import leads from a file</h1>
        <p className="text-sm text-muted-foreground">
          A one-off bulk import for a spreadsheet of prospects — a list from an event, an old sheet, an export from
          another tool. Not a live connection: nothing runs automatically, and nothing is scheduled.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload a CSV</CardTitle>
        </CardHeader>
        <CardContent>
          <FileUploadImport />
        </CardContent>
      </Card>
    </div>
  );
}
