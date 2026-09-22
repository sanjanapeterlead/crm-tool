import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMetaConfig, getWebhookUrl } from "@/lib/integrations/meta/config";
import { listOrgMembers } from "@/lib/services/team";
import * as metaService from "@/lib/services/meta";
import { listBackfillJobs } from "@/lib/services/meta-backfill";
import { MetaConnectionCard } from "@/components/crm/integrations/meta-connection-card";
import { MetaPagesList } from "@/components/crm/integrations/meta-pages-list";
import { MetaBackfillPanel } from "@/components/crm/integrations/meta-backfill-panel";
import { MetaEventLog } from "@/components/crm/integrations/meta-event-log";
import type { MetaWebhookEvent, Profile } from "@/lib/types/domain";

const ERROR_MESSAGES: Record<string, string> = {
  not_configured:
    "This deployment is missing META_APP_ID, META_APP_SECRET or META_WEBHOOK_VERIFY_TOKEN.",
  denied: "The Facebook authorization was cancelled.",
  missing_code: "Facebook did not return an authorization code. Try connecting again.",
  invalid_state: "That authorization link expired. Start the connection again.",
  state_mismatch: "The authorization was started by a different account. Try again.",
  no_pages:
    "That Facebook account doesn't administer any Pages. Meta lead ads require a Page you manage.",
  exchange_failed: "Facebook rejected the token exchange.",
};

export default async function MetaIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const session = await requireRole(["admin"]);
  const supabase = await createClient();
  const config = getMetaConfig();

  const [connection, pages, forms, events, jobs, members] = await Promise.all([
    metaService.getConnection(supabase, session.orgId),
    metaService.listPages(supabase, session.orgId),
    metaService.listLeadForms(supabase, session.orgId),
    metaService.listWebhookEvents(supabase, session.orgId),
    listBackfillJobs(supabase, session.orgId),
    listOrgMembers(supabase, session),
  ]);

  const memberProfiles = members
    .map((m) => (Array.isArray(m.profile) ? m.profile[0] : m.profile) as Profile)
    .filter(Boolean);

  const errorKey = params.error;
  const errorMessage = errorKey
    ? (ERROR_MESSAGES[errorKey] ?? "Connecting to Meta failed.") +
      (params.detail ? ` (${params.detail})` : "")
    : null;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/settings"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Settings
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Meta Ads</h1>
        <p className="text-sm text-muted-foreground">
          Connect Facebook and Instagram lead ads so every form submission lands in this CRM
          automatically.
        </p>
      </div>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
      {params.connected === "1" && (
        <Alert>
          <AlertDescription>
            Meta account connected. Subscribe a Page below to start receiving leads.
          </AlertDescription>
        </Alert>
      )}

      {!config ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Not configured</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              This deployment has no Meta app credentials, so the connection flow is unavailable.
              Set the following environment variables and redeploy:
            </p>
            <ul className="list-inside list-disc font-mono text-xs">
              <li>META_APP_ID</li>
              <li>META_APP_SECRET</li>
              <li>META_WEBHOOK_VERIFY_TOKEN</li>
            </ul>
          </CardContent>
        </Card>
      ) : (
        <>
          <MetaConnectionCard
            connection={connection}
            members={memberProfiles}
            webhookUrl={getWebhookUrl(config)}
            verifyTokenSet={Boolean(config.webhookVerifyToken)}
          />

          {connection && (
            <>
              <MetaPagesList pages={pages} />
              <MetaBackfillPanel
                forms={forms as Array<{
                  form_id: string;
                  form_name: string;
                  leads_count: number | null;
                  last_backfilled_at: string | null;
                }>}
                jobs={jobs}
              />
              <MetaEventLog events={events as unknown as MetaWebhookEvent[]} />
            </>
          )}
        </>
      )}
    </div>
  );
}
