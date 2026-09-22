"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { selectWhatsAppNumberAction } from "@/app/(app)/settings/integrations/whatsapp/actions";
import type { WhatsAppAvailableNumber } from "@/lib/services/whatsapp";

/** Shown only when OAuth discovered more than one WABA/number — the admin resolves which one sends. */
export function WhatsAppNumberPicker({ numbers }: { numbers: WhatsAppAvailableNumber[] }) {
  const [pending, startTransition] = useTransition();

  function handleSelect(phoneNumberId: string) {
    startTransition(async () => {
      const result = await selectWhatsAppNumberAction(phoneNumberId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Sending number set");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Choose a sending number</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          The connected account has access to more than one WhatsApp number. Pick the one this
          organization sends from.
        </p>
        <ul className="divide-y">
          {numbers.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium">{n.display_phone_number ?? n.phone_number_id}</p>
                <p className="text-xs text-muted-foreground">
                  {n.verified_name} · {n.waba_name ?? n.waba_id} · {n.business_name ?? n.business_id}
                </p>
              </div>
              <Button size="sm" disabled={pending} onClick={() => handleSelect(n.phone_number_id)}>
                Use this number
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
