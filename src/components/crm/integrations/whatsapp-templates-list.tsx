"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { syncWhatsAppTemplatesAction } from "@/app/(app)/settings/integrations/whatsapp/actions";
import type { WhatsAppTemplateRow } from "@/lib/services/whatsapp";

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  APPROVED: "secondary",
  PENDING: "outline",
  REJECTED: "destructive",
};

export function WhatsAppTemplatesList({
  templates,
  canSync,
}: {
  templates: WhatsAppTemplateRow[];
  canSync: boolean;
}) {
  const [syncing, startSync] = useTransition();

  function handleSync() {
    startSync(async () => {
      const result = await syncWhatsAppTemplatesAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Synced ${result.data?.synced ?? 0} template(s)`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Templates</CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing || !canSync}>
            <RefreshCw className={syncing ? "animate-spin" : undefined} />
            {syncing ? "Syncing…" : "Sync templates"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canSync
              ? "No templates synced yet. Click Sync templates to pull them from your WhatsApp Business Account."
              : "Select a sending number above before syncing templates."}
          </p>
        ) : (
          <ul className="divide-y">
            {templates.map((t) => (
              <li key={t.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{t.name}</span>
                  <Badge variant={STATUS_VARIANT[t.status] ?? "outline"}>{t.status}</Badge>
                  <span className="text-xs text-muted-foreground">{t.language}</span>
                  {t.variable_count > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t.variable_count} variable{t.variable_count === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{t.body_text}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
