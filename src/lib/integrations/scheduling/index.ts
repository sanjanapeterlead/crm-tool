import { CalendlyProvider } from "./calendly";
import type { SchedulingProvider } from "./types";

export type { SchedulingProvider, SchedulingPrefill } from "./types";

/**
 * Returns the org's active scheduling provider. Calendly is the only
 * implementation today; swapping in a future provider is a matter of
 * branching here on `integration_settings.provider` — nothing else in the
 * app needs to know a provider exists.
 */
export function getSchedulingProvider(calendlyBookingUrl: string | null): SchedulingProvider {
  return new CalendlyProvider(calendlyBookingUrl);
}
