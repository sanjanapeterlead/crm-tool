import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials, personHue, toneStyle } from "@/lib/ui/tones";

/** Initials avatar with a stable per-person color, so reps are recognisable at a glance. */
export function PersonAvatar({
  name,
  size = "default",
  className,
}: {
  name: string;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} className={className}>
      <AvatarFallback
        style={toneStyle(personHue(name))}
        className={cn("tone-soft font-semibold", size === "sm" ? "text-[10px]" : "text-xs")}
      >
        {initials(name) || "?"}
      </AvatarFallback>
    </Avatar>
  );
}
