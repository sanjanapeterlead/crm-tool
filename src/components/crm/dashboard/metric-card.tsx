import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: "default" | "warning" | "success";
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold tabular-nums",
              tone === "warning" && "text-amber-600 dark:text-amber-400",
              tone === "success" && "text-emerald-600 dark:text-emerald-400"
            )}
          >
            {value}
          </p>
        </div>
        <Icon className="size-8 text-muted-foreground/40" />
      </CardContent>
    </Card>
  );
}
