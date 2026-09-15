import type { SchedulingPrefill, SchedulingProvider } from "./types";

export class CalendlyProvider implements SchedulingProvider {
  readonly name = "calendly";

  constructor(private readonly bookingUrl: string | null) {}

  isConfigured() {
    return Boolean(this.bookingUrl);
  }

  getBookingUrl(prefill: SchedulingPrefill): string | null {
    if (!this.bookingUrl) return null;

    const url = new URL(this.bookingUrl);
    if (prefill.name) url.searchParams.set("name", prefill.name);
    if (prefill.email) url.searchParams.set("email", prefill.email);
    return url.toString();
  }
}
