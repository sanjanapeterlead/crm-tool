"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  runBackfillBatchAction,
  startBackfillAction,
  syncLeadFormsAction,
} from "@/app/(app)/settings/integrations/meta/actions";
import type { BackfillJob } from "@/lib/services/meta-backfill";

interface FormOption {
  form_id: string;
  form_name: string;
  leads_count: number | null;
  last_backfilled_at: string | null;
}

interface Progress {
  imported: number;
  skipped: number;
  failed: number;
}

/** Hard stop on the client-driven batch loop, so a runaway import can't spin forever. */
const MAX_BATCHES = 200;

export function MetaBackfillPanel({
  forms,
  jobs,
}: {
  forms: FormOption[];
  jobs: BackfillJob[];
}) {
  const [syncing, startSync] = useTransition();
  const [selectedForm, setSelectedForm] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);

  function handleSync() {
    startSync(async () => {
      const result = await syncLeadFormsAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Synced ${result.data?.synced ?? 0} lead form(s)`);
    });
  }

  /**
   * Drives the import from the browser: each call imports a few pages and
   * returns, which keeps every request well inside the serverless timeout.
   */
  async function handleImport() {
    if (!selectedForm) return;

    setRunning(true);
    setProgress({ imported: 0, skipped: 0, failed: 0 });

    const started = await startBackfillAction(selectedForm);
    if (!started.ok) {
      toast.error(started.error);
      setRunning(false);
      return;
    }

    const jobId = started.data!.jobId;

    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const result = await runBackfillBatchAction(jobId);
      if (!result.ok) {
        toast.error(result.error);
        setRunning(false);
        return;
      }

      const { done, status, imported, skipped, failed, error } = result.data!;
      setProgress({ imported, skipped, failed });

      if (done) {
        setRunning(false);
        if (status === "failed") {
          toast.error(error ?? "Import failed.");
        } else {
          toast.success(`Imported ${imported} lead(s), skipped ${skipped} already in the CRM`);
        }
        return;
      }
    }

    setRunning(false);
    toast.error("Import stopped after too many batches. Run it again to continue.");
  }

  const formLabel = (value: string) =>
    value ? forms.find((f) => f.form_id === value)?.form_name ?? "Select a form" : "Select a form";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import historical leads</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Pulls past submissions from a Meta lead form. Leads already in the CRM are skipped, so
          running this twice is safe.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-sm">
            <Select
              value={selectedForm}
              onValueChange={(v) => setSelectedForm(v ?? "")}
              disabled={running || forms.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a form">{formLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {forms.map((form) => (
                  <SelectItem key={form.form_id} value={form.form_id}>
                    {form.form_name}
                    {form.leads_count != null && ` (${form.leads_count})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleImport} disabled={!selectedForm || running}>
            {running ? "Importing…" : "Import"}
          </Button>
          <Button variant="outline" onClick={handleSync} disabled={syncing || running}>
            <RefreshCw className={syncing ? "animate-spin" : undefined} />
            {syncing ? "Syncing…" : "Sync forms"}
          </Button>
        </div>

        {forms.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No lead forms discovered yet — click <strong>Sync forms</strong> to fetch them from your
            connected Pages.
          </p>
        )}

        {progress && (
          <p className="text-sm" aria-live="polite">
            Imported <strong>{progress.imported}</strong> · skipped{" "}
            <strong>{progress.skipped}</strong>
            {progress.failed > 0 && (
              <>
                {" "}
                · failed <strong>{progress.failed}</strong>
              </>
            )}
            {running && " — still working…"}
          </p>
        )}

        {jobs.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-medium text-muted-foreground">Recent imports</p>
            <ul className="space-y-1.5">
              {jobs.slice(0, 5).map((job) => (
                <li key={job.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={job.status === "failed" ? "destructive" : "outline"}>
                    {job.status}
                  </Badge>
                  <span className="truncate">{job.form_name ?? job.form_id}</span>
                  <span className="text-muted-foreground">
                    {job.imported_count} imported · {job.skipped_count} skipped
                    {job.failed_count > 0 && ` · ${job.failed_count} failed`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(job.created_at), "MMM d, h:mm a")}
                  </span>
                  {job.error && <span className="text-xs text-destructive">{job.error}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
