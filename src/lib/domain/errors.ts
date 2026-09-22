/**
 * An error whose message is safe and useful to show the person who caused it
 * ("Enter a valid phone number", "Only a manager can reassign a lead").
 *
 * Anything else that escapes a service is a bug or an outage: it gets logged
 * with detail and the user sees a generic message, so database internals
 * (constraint names, column lists) never reach the browser.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}
