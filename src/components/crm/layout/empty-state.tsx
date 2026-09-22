import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

const TONE = {
  brand: "bg-primary/8 border-primary/25 text-primary/70",
  warning: "bg-warning/10 border-warning/30 text-warning",
  muted: "bg-muted border-border text-muted-foreground",
} as const;

/**
 * The one "nothing here yet" pattern for empty lists, unconnected
 * integrations and not-yet-available features (AI insights). A big icon in a
 * soft dashed circle reads as an illustration next to the small functional
 * icons used in nav/buttons/timelines, without a library of custom art to
 * maintain — see docs/DECISIONS.md on the UI pass for why.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "brand",
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  tone?: keyof typeof TONE;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-10 px-6 text-center",
        className
      )}
    >
      <span className={cn("relative flex size-14 items-center justify-center rounded-full border border-dashed", TONE[tone])}>
        <Icon className="size-6" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
