import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

/**
 * The one page-header pattern every top-level screen uses: icon + title +
 * one-line description on the left, primary actions on the right. Exists so
 * "Leads", "Pipeline", "Meetings" etc. stop each reinventing their own
 * spacing/type-scale by hand — the inconsistency that made the product feel
 * scattered page to page (see the UI/UX audit).
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary to-[oklch(0.62_0.16_calc(var(--brand-h)_+_50))] text-primary-foreground shadow-md shadow-primary/25">
            <Icon className="size-4.5" />
          </span>
        )}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
