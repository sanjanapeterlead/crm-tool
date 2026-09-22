"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setMemberActiveAction } from "@/app/(app)/team/actions";

export function MemberActiveToggle({
  userId,
  isActive,
  isSelf,
}: {
  userId: string;
  isActive: boolean;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (isSelf) return null;

  function handleClick() {
    startTransition(async () => {
      const result = await setMemberActiveAction(userId, !isActive);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(isActive ? "Access revoked" : "Access restored");
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={handleClick}>
      {isActive ? "Deactivate" : "Reactivate"}
    </Button>
  );
}
