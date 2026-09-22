import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TONE_HUE, toneStyle, type ToneName } from "@/lib/ui/tones";
import type { LucideIcon } from "lucide-react";

/**
 * `tone` colors the icon tile. Only warning/success also color the number —
 * those carry meaning ("something is overdue"); the rest are just there so a
 * row of cards isn't a wall of grey.
 */
export function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: "default" | ToneName;
}) {
  const hue = tone && tone !== "default" ? TONE_HUE[tone] : null;

  return (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardContent className="flex items-center justify-between gap-3 py-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p
            style={hue !== null ? toneStyle(hue) : undefined}
            className={cn(
              "mt-1 text-2xl font-semibold tabular-nums",
              (tone === "warning" || tone === "success") && "tone-fg"
            )}
          >
            {value}
          </p>
        </div>
        <span
          style={hue !== null ? toneStyle(hue) : undefined}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            hue !== null ? "tone-soft" : "bg-primary/10 text-primary"
          )}
        >
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}
