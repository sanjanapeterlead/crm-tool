"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setMemberRoleAction } from "@/app/(app)/team/actions";
import type { OrgRole } from "@/lib/domain/permissions";

const LABELS: Record<OrgRole, string> = { admin: "Admin", manager: "Manager", salesperson: "Salesperson" };

/** Change a member's role. The server refuses to demote the last admin; the UI just reports it. */
export function MemberRoleSelect({ userId, role, name }: { userId: string; role: OrgRole; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<OrgRole>(role);

  function change(next: OrgRole) {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await setMemberRoleAction(userId, next);
      if (!result.ok) {
        toast.error(result.error);
        setValue(previous);
        return;
      }
      toast.success(`${name} is now ${LABELS[next].toLowerCase()}`);
      router.refresh();
    });
  }

  return (
    <Select value={value} onValueChange={(v) => v && v !== value && change(v as OrgRole)} disabled={pending}>
      <SelectTrigger className="h-8 w-36" aria-label={`Role for ${name}`}>
        <SelectValue>{(v: OrgRole) => LABELS[v]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(LABELS) as OrgRole[]).map((r) => (
          <SelectItem key={r} value={r}>
            {LABELS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
