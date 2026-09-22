import Link from "next/link";
import { cn } from "@/lib/utils";

/** The org's initial on a brand gradient tile, plus its name — the app's logo. */
export function BrandMark({ orgName, className }: { orgName: string; className?: string }) {
  return (
    <Link href="/" className={cn("flex min-w-0 items-center gap-2.5 font-semibold tracking-tight", className)}>
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-primary to-[oklch(0.62_0.16_calc(var(--brand-h)_+_50))] text-sm font-bold text-primary-foreground shadow-sm shadow-primary/30"
      >
        {orgName.trim().charAt(0).toUpperCase() || "S"}
      </span>
      <span className="truncate">{orgName}</span>
    </Link>
  );
}
