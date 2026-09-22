"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { importLeadsFileAction } from "@/app/(app)/settings/integrations/file-upload/actions";
import type { FileImportSummary } from "@/lib/services/file-import";

const SAMPLE_CSV = "first_name,last_name,phone,email,source\nRohan,Mehta,9876543210,rohan@example.com,Referral\n";

function downloadSample() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sample-leads.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function FileUploadImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [summary, setSummary] = useState<FileImportSummary | null>(null);
  const router = useRouter();

  async function handleUpload() {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      toast.error("Choose a CSV file first.");
      return;
    }
    setPending(true);
    setSummary(null);
    const formData = new FormData();
    formData.set("file", file);
    const result = await importLeadsFileAction(formData);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSummary(result.data ?? null);
    if (inputRef.current) inputRef.current.value = "";
    toast.success(`Imported ${file.name}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          className="max-w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
          disabled={pending}
        />
        <Button onClick={handleUpload} disabled={pending}>
          <UploadCloud className="size-4" />
          {pending ? "Importing…" : "Import leads"}
        </Button>
        <Button variant="outline" type="button" onClick={downloadSample}>
          Download sample CSV
        </Button>
      </div>

      <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Columns</p>
        <p>
          Required: <code>first_name</code> (or a single <code>name</code>/<code>full_name</code> column) and at
          least one of <code>phone</code> / <code>email</code>. Optional: <code>last_name</code>,{" "}
          <code>source</code> (matched against Facebook Ad / Instagram / Referral / Website / Manual / Other —
          anything else is kept as &quot;Other&quot;), <code>tags</code> (semicolon- or comma-separated),{" "}
          <code>priority</code> (low/medium/high), <code>value</code>. Column names are matched loosely (spaces,
          underscores and case don&apos;t matter, so &quot;Work Email&quot; and &quot;phone_number&quot; are
          recognized) and any extra columns your export has are ignored. Comma, tab and semicolon-separated files all
          work — paste straight from a spreadsheet and save as .csv, or export as-is.
        </p>
        <p className="mt-1">
          Each row goes through the same dedupe as every other lead source: a phone or email that already exists
          joins that person&apos;s existing opportunity instead of creating a second one. Up to 1,000 rows and
          2&nbsp;MB per upload.
        </p>
      </div>

      {summary && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-medium">
              {summary.fileName} — {summary.totalRows} row{summary.totalRows === 1 ? "" : "s"} read
            </p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
              <div>
                <dt className="text-muted-foreground">Created</dt>
                <dd className="font-medium">{summary.created}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Merged</dt>
                <dd className="font-medium">{summary.merged}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Duplicate</dt>
                <dd className="font-medium">{summary.duplicate}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Restricted</dt>
                <dd className="font-medium">{summary.restricted}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Failed</dt>
                <dd className="font-medium">{summary.failed}</dd>
              </div>
            </dl>
            {summary.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">Rows skipped</p>
                <ul className="max-h-48 space-y-0.5 overflow-y-auto text-sm text-muted-foreground">
                  {summary.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.rowNumber}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
