"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setWhatsAppConsentAction } from "@/app/(app)/actions";
import type { ConsentStatus } from "@/lib/domain/whatsapp";

const LABELS: Record<ConsentStatus, string> = {
  unknown: "Consent not recorded",
  opted_in: "Opted in",
  opted_out: "Opted out",
};

/**
 * WhatsApp expects businesses to message only people who opted in. The CRM
 * records that (and who said so) but doesn't guess: "not recorded" is allowed,
 * an explicit opt-out blocks sending everywhere.
 */
export function WhatsAppConsentControl({
  leadId,
  status,
  source,
}: {
  leadId: string;
  status: ConsentStatus;
  source: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<ConsentStatus>(status);

  function change(next: ConsentStatus) {
    setValue(next);
    startTransition(async () => {
      const result = await setWhatsAppConsentAction(leadId, next, "recorded by a team member");
      if (!result.ok) {
        toast.error(result.error);
        setValue(status);
        return;
      }
      toast.success("Consent updated");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant={value === "opted_out" ? "destructive" : value === "opted_in" ? "secondary" : "outline"}>
        {LABELS[value]}
      </Badge>
      <Select value={value} onValueChange={(v) => v && change(v as ConsentStatus)} disabled={pending}>
        <SelectTrigger className="h-7 w-40 text-xs" aria-label="WhatsApp consent">
          <SelectValue>{(v: ConsentStatus) => LABELS[v] ?? "Consent"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unknown">Not recorded</SelectItem>
          <SelectItem value="opted_in">Opted in</SelectItem>
          <SelectItem value="opted_out">Opted out</SelectItem>
        </SelectContent>
      </Select>
      {source && value !== "unknown" && <span className="text-xs text-muted-foreground">({source})</span>}
    </div>
  );
}
