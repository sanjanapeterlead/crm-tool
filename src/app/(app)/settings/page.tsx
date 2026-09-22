import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getOrganization } from "@/lib/services/settings";
import { getConnection as getMetaConnection } from "@/lib/services/meta";
import { getConnection as getWhatsAppConnection } from "@/lib/services/whatsapp";
import { getCalendarConnection } from "@/lib/services/calendar-connections";
import { permissions } from "@/lib/domain/permissions";
import { SettingsForm } from "@/components/crm/settings/settings-form";

function IntegrationRow({
  href,
  name,
  description,
  connected,
  label,
}: {
  href: string;
  name: string;
  description: string;
  connected: boolean;
  /** Overrides the Connected / Not connected badge. */
  label?: string;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <Link href={href} className="flex items-center justify-between gap-4 p-4 hover:bg-muted/50">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{name}</span>
              {label ? (
                <Badge variant="outline">{label}</Badge>
              ) : connected ? (
                <Badge variant="secondary">Connected</Badge>
              ) : (
                <Badge variant="outline">Not connected</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      </CardContent>
    </Card>
  );
}

export default async function SettingsPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const isAdmin = permissions.canEditSettings(session.role);

  const [organization, metaConnection, whatsAppConnection, calendarConnection] = await Promise.all([
    getOrganization(supabase, session.orgId),
    isAdmin ? getMetaConnection(supabase, session.orgId) : Promise.resolve(null),
    isAdmin ? getWhatsAppConnection(supabase, session.orgId) : Promise.resolve(null),
    isAdmin ? getCalendarConnection(supabase, session.orgId) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Organization and integration configuration.</p>
      </div>

      {isAdmin ? (
        <>
          <SettingsForm
            orgName={organization.name}
            calendlyBookingUrl={organization.calendly_booking_url}
            timezone={(organization.timezone as string | undefined) ?? "Asia/Kolkata"}
          />

          <IntegrationRow
            href="/settings/integrations"
            name="Integrations & health"
            description="See whether each connection is working, recent deliveries, and the audit log."
            connected
            label="Overview"
          />

          <IntegrationRow
            href="/settings/integrations/meta"
            name="Meta Ads"
            description="Ingest Facebook and Instagram lead ads straight into the CRM."
            connected={Boolean(metaConnection)}
          />
          <IntegrationRow
            href="/settings/integrations/whatsapp"
            name="WhatsApp"
            description="Send approved WhatsApp templates to leads from their detail page."
            connected={Boolean(whatsAppConnection)}
          />
          <IntegrationRow
            href="/settings/integrations/google"
            name="Google Calendar & Meet"
            description="Schedule meetings with a Meet link and calendar invitations."
            connected={Boolean(calendarConnection)}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Only admins can change organization settings. Contact your admin to update these.
        </p>
      )}
    </div>
  );
}
