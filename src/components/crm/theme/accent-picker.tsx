"use client";

import { useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENTS, ACCENT_COOKIE, parseAccent, type AccentId } from "@/lib/theme/accents";

// The accent lives on <html data-accent> (server-rendered from the cookie), so
// the DOM is the source of truth and this is a tiny external store over it.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readAccent() {
  return parseAccent(document.documentElement.dataset.accent);
}

function applyAccent(id: AccentId) {
  document.documentElement.dataset.accent = id;
  document.cookie = `${ACCENT_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
  listeners.forEach((l) => l());
}

/**
 * Accent swatches, rendered inside the user menu. Plain buttons rather than
 * menu items so picking a color doesn't close the menu — you can try a few
 * and watch the app re-tint behind it.
 */
export function AccentPicker() {
  // null on the server so nothing renders as selected until hydration,
  // rather than a guess that mismatches.
  const accent = useSyncExternalStore(subscribe, readAccent, () => null);

  return (
    <div className="space-y-1.5 px-2 py-2">
      <p className="text-xs font-medium text-muted-foreground">Accent color</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Accent color">
        {ACCENTS.map((a) => {
          const selected = accent === a.id;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={a.label}
              title={a.label}
              onClick={() => applyAccent(a.id)}
              style={{ backgroundColor: `oklch(0.6 0.16 ${a.hue})` }}
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-popover transition-transform hover:scale-110",
                selected && "ring-2 ring-foreground/70"
              )}
            >
              {selected && <Check className="size-3.5" strokeWidth={3} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
