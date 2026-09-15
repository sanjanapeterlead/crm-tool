import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getOrganization } from "@/lib/services/settings";
import { permissions } from "@/lib/permissions";
import { SettingsForm } from "@/components/crm/settings/settings-form";

export default async function SettingsPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const organization = await getOrganization(supabase, session.orgId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Organization and integration configuration.</p>
      </div>

      {permissions.canEditSettings(session.role) ? (
        <SettingsForm orgName={organization.name} calendlyBookingUrl={organization.calendly_booking_url} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Only admins can change organization settings. Contact your admin to update these.
        </p>
      )}
    </div>
  );
}
