export interface SchedulingPrefill {
  name?: string;
  email?: string;
}

/**
 * Boundary between the CRM's business logic and whatever external service
 * actually hosts the booking flow (Calendly today; a future provider could
 * plug in without touching lead/meeting code elsewhere in the app).
 */
export interface SchedulingProvider {
  readonly name: string;
  /** True when an org has configured this provider. */
  isConfigured(): boolean;
  /** Booking URL to open for the salesperson, with lead details prefilled where the provider supports it. */
  getBookingUrl(prefill: SchedulingPrefill): string | null;
}
