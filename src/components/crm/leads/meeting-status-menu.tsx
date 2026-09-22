"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateMeetingStatusAction } from "@/app/(app)/actions";
import type { MeetingStatus } from "@/lib/types/domain";

const OPTIONS: { value: MeetingStatus; label: string }[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No show" },
];

export function MeetingStatusMenu({
  meetingId,
  status,
}: {
  meetingId: string;
  status: MeetingStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSelect(next: MeetingStatus) {
    if (next === status) return;
    startTransition(async () => {
      const result = await updateMeetingStatusAction(meetingId, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Meeting updated");
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={pending} />}>
        {OPTIONS.find((o) => o.value === status)?.label}
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => handleSelect(o.value)}>
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
