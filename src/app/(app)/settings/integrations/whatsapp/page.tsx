import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getWhatsAppMetaConfig } from "@/lib/integrations/whatsapp/config";
import * as whatsappService from "@/lib/services/whatsapp";
import { WhatsAppConnectionCard } from "@/components/crm/integrations/whatsapp-connection-card";
import { WhatsAppNumberPicker } from "@/components/crm/integrations/whatsapp-number-picker";
import { WhatsAppTemplatesList } from "@/components/crm/integrations/whatsapp-templates-list";

const ERROR_MESSAGES: Record<string, string> = {
  not_configured:
    "This deployment is missing META_APP_ID, META_APP_SECRET or META_WEBHOOK_VERIFY_TOKEN.",
  denied: "The Facebook authorization was cancelled.",
  missing_code: "Facebook did not return an authorization code. Try connecting again.",
  invalid_state: "That authorization link expired. Start the connection again.",
  state_mismatch: "The authorization was started by a different account. Try again.",
  no_numbers:
    "No WhatsApp Business number was found on that account. Complete WhatsApp Business setup in Meta Business Manager first, then reconnect.",
  exchange_failed: "Facebook rejected the token exchange.",
};

export default async function WhatsAppIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const session = await requireRole(["admin"]);
  const supabase = await createClient();
  const config = getWhatsAppMetaConfig();

  const [connection, availableNumbers, templates] = await Promise.all([
    whatsappService.getConnection(supabase, session.orgId),
    whatsappService.listAvailableNumbers(supabase, session.orgId),
    whatsappService.listTemplates(supabase, session.orgId),
  ]);

  const errorKey = params.error;
  const errorMessage = errorKey
    ? (ERROR_MESSAGES[errorKey] ?? "Connecting WhatsApp failed.") +
      (params.detail ? ` (${params.detail})` : "")
    : null;

  const needsNumberSelection = Boolean(connection) && !connection?.phone_number_id;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/settings"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Settings
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Send approved WhatsApp templates to leads straight from their detail page.
        </p>
      </div>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
      {params.connected === "1" && !needsNumberSelection && (
        <Alert>
          <AlertDescription>
            WhatsApp connected. Sync templates below to start sending.
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
          <WhatsAppConnectionCard connection={connection} />

          {needsNumberSelection && availableNumbers.length > 0 && (
            <WhatsAppNumberPicker numbers={availableNumbers} />
          )}

          {connection && (
            <WhatsAppTemplatesList templates={templates} canSync={Boolean(connection.waba_id)} />
          )}
        </>
      )}
    </div>
  );
}
