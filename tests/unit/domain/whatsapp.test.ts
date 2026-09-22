import { describe, expect, it } from "vitest";
import {
  checkSendAllowed,
  isOptOutText,
  isWithinServiceWindow,
  nextMessageStatus,
  serviceWindowClosesAt,
} from "@/lib/domain/whatsapp";

describe("24-hour service window", () => {
  const now = new Date("2026-09-20T12:00:00Z");

  it("is open within 24 hours of the customer's last message", () => {
    expect(isWithinServiceWindow("2026-09-20T11:59:00Z", now)).toBe(true);
    expect(isWithinServiceWindow("2026-09-19T12:00:01Z", now)).toBe(true);
  });

  it("is closed at exactly 24 hours and beyond", () => {
    expect(isWithinServiceWindow("2026-09-19T12:00:00Z", now)).toBe(false);
    expect(isWithinServiceWindow("2026-09-01T00:00:00Z", now)).toBe(false);
  });

  it("is closed when the customer has never messaged, or the timestamp is junk", () => {
    expect(isWithinServiceWindow(null, now)).toBe(false);
    expect(isWithinServiceWindow(undefined, now)).toBe(false);
    expect(isWithinServiceWindow("not a date", now)).toBe(false);
  });

  it("reports when the window closes", () => {
    expect(serviceWindowClosesAt("2026-09-20T10:00:00Z")?.toISOString()).toBe("2026-09-21T10:00:00.000Z");
    expect(serviceWindowClosesAt(null)).toBeNull();
  });
});

describe("nextMessageStatus", () => {
  it("moves forward through sent → delivered → read", () => {
    expect(nextMessageStatus("sent", "delivered")).toBe("delivered");
    expect(nextMessageStatus("delivered", "read")).toBe("read");
    expect(nextMessageStatus("sent", "read")).toBe("read"); // 'delivered' receipt lost or late
  });

  it("never goes backwards when receipts arrive late or twice", () => {
    expect(nextMessageStatus("read", "delivered")).toBe("read");
    expect(nextMessageStatus("read", "sent")).toBe("read");
    expect(nextMessageStatus("delivered", "delivered")).toBe("delivered");
  });

  it("only fails a message that hadn't reached the customer", () => {
    expect(nextMessageStatus("sent", "failed")).toBe("failed");
    expect(nextMessageStatus("delivered", "failed")).toBe("delivered");
    expect(nextMessageStatus("read", "failed")).toBe("read");
  });

  it("keeps a failed message failed", () => {
    expect(nextMessageStatus("failed", "delivered")).toBe("failed");
    expect(nextMessageStatus("failed", "failed")).toBe("failed");
  });

  it("leaves inbound messages alone", () => {
    expect(nextMessageStatus("received", "delivered")).toBe("received");
  });
});

describe("opt-out detection", () => {
  it.each(["STOP", "stop", "  Stop  ", "Unsubscribe", "stop.", "STOP ALL", "opt out"])("recognises %j", (text) => {
    expect(isOptOutText(text)).toBe(true);
  });

  it.each(["Please don't stop calling", "I want to stop by tomorrow", "stopping", "", null, undefined, "yes"])(
    "does not treat %j as an opt-out",
    (text) => {
      expect(isOptOutText(text as string | null | undefined)).toBe(false);
    }
  );
});

describe("checkSendAllowed", () => {
  it("blocks only an explicit opt-out", () => {
    expect(checkSendAllowed("opted_out").allowed).toBe(false);
    expect(checkSendAllowed("opted_in").allowed).toBe(true);
    expect(checkSendAllowed("unknown").allowed).toBe(true);
  });

  it("explains why it blocked", () => {
    const gate = checkSendAllowed("opted_out");
    expect(gate.allowed ? "" : gate.reason).toMatch(/opted out/i);
  });
});
