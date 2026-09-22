"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateSettingsAction } from "@/app/(app)/settings/actions";
import { COMMON_TIMEZONES } from "@/lib/validation/settings";

export function SettingsForm({
  orgName,
  calendlyBookingUrl,
  timezone,
}: {
  orgName: string;
  calendlyBookingUrl: string | null;
  timezone: string;
}) {
  const [name, setName] = useState(orgName);
  const [calendlyUrl, setCalendlyUrl] = useState(calendlyBookingUrl ?? "");
  const [zone, setZone] = useState(timezone);
  const [pending, setPending] = useState(false);

  // Keep the org's current zone selectable even if it isn't one of the common ones.
  const zones = (COMMON_TIMEZONES as readonly string[]).includes(timezone)
    ? [...COMMON_TIMEZONES]
    : [timezone, ...COMMON_TIMEZONES];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const result = await updateSettingsAction({ name, calendly_booking_url: calendlyUrl || null, timezone: zone });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Settings saved");
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="org-name">Organization name</Label>
        <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="org-timezone">Timezone</Label>
        <Select value={zone} onValueChange={(v) => v && setZone(v)}>
          <SelectTrigger id="org-timezone" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {zones.map((z) => (
              <SelectItem key={z} value={z}>
                {z.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          &ldquo;Today&rdquo;, &ldquo;overdue&rdquo; and meeting times are all measured in this timezone.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="calendly-url">Calendly booking URL</Label>
        <Input
          id="calendly-url"
          placeholder="https://calendly.com/your-team/intro-call"
          value={calendlyUrl}
          onChange={(e) => setCalendlyUrl(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Shown as the &ldquo;Schedule Meeting&rdquo; link on every lead&apos;s detail page.
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
