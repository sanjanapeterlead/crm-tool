"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSettingsAction } from "@/app/(app)/settings/actions";

export function SettingsForm({
  orgName,
  calendlyBookingUrl,
}: {
  orgName: string;
  calendlyBookingUrl: string | null;
}) {
  const [name, setName] = useState(orgName);
  const [calendlyUrl, setCalendlyUrl] = useState(calendlyBookingUrl ?? "");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const result = await updateSettingsAction({ name, calendly_booking_url: calendlyUrl || null });
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
        <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
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
