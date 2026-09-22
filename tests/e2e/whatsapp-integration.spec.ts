import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  assertTemplateApproved,
  countVariables,
  normalizePhoneForWhatsApp,
  renderBody,
} from "../../src/lib/integrations/whatsapp/mapping";

// Covers the WhatsApp integration's pure logic (template variable handling,
// phone normalization), the token-isolation guarantee, and the send flow
// driven through the real UI. `src/lib/services/whatsapp.ts` imports
// `server-only`, which throws if imported directly into this Node test
// process (it's a Next.js bundler-time guard, not a runtime check) — so
// anything that needs that service goes through an actual page interaction
// or the plain `@supabase/supabase-js` admin client instead, never a direct
// import of the service module.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54331",
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// The seeded org's id is a random UUID generated fresh by every `db:reset`
// (see supabase/seed.sql's use of gen_random_uuid()), so it must be looked
// up by its stable slug rather than hardcoded.
async function getOrgId(db: ReturnType<typeof admin>): Promise<string> {
  const { data, error } = await db
    .from("organizations")
    .select("id")
    .eq("slug", "summit-sales-group")
    .single();
  if (error || !data) throw new Error("Seeded organization not found — run `npm run db:reset` first.");
  return data.id as string;
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

test.describe("WhatsApp template variables", () => {
  test("counts positional {{n}} placeholders", () => {
    expect(countVariables("Hi {{1}}, your meeting with {{2}} is tomorrow.")).toBe(2);
    expect(countVariables("Hi there, thanks for reaching out.")).toBe(0);
  });

  test("counts by the highest index, not occurrence count", () => {
    // A template could in principle reuse a variable — the compose UI needs
    // one input per distinct index, not one per occurrence.
    expect(countVariables("{{1}} and {{1}} again, then {{3}}")).toBe(3);
  });

  test("substitutes each placeholder with its 1-indexed value", () => {
    const rendered = renderBody("Hi {{1}}, this is a reminder about your meeting with {{2}}.", [
      "Sanjana",
      "Jordan",
    ]);
    expect(rendered).toBe("Hi Sanjana, this is a reminder about your meeting with Jordan.");
  });

  test("leaves a placeholder untouched when no value was supplied", () => {
    const rendered = renderBody("Hi {{1}}, following up on {{2}}.", ["Sanjana"]);
    expect(rendered).toBe("Hi Sanjana, following up on {{2}}.");
  });

  test("renders a template with no variables unchanged", () => {
    expect(renderBody("Thanks for reaching out!", [])).toBe("Thanks for reaching out!");
  });
});

test.describe("Phone number normalization", () => {
  test("strips formatting down to digits", () => {
    expect(normalizePhoneForWhatsApp("+1-555-0123456")).toBe("15550123456");
  });

  test("handles a number with spaces and parentheses", () => {
    expect(normalizePhoneForWhatsApp("+1 (555) 010-2000")).toBe("15550102000");
  });

  test("rejects a string with too few digits to be a phone number", () => {
    expect(normalizePhoneForWhatsApp("555-0123")).toBeNull();
  });

  test("rejects a string with more digits than any real phone number", () => {
    expect(normalizePhoneForWhatsApp("1".repeat(20))).toBeNull();
  });
});

test.describe("Template approval guard", () => {
  test("allows an approved template through", () => {
    expect(() => assertTemplateApproved({ name: "welcome", status: "APPROVED" })).not.toThrow();
  });

  test("rejects a pending template with a message naming it and its status", () => {
    expect(() => assertTemplateApproved({ name: "follow_up_nudge", status: "PENDING" })).toThrow(
      /follow_up_nudge.*PENDING/
    );
  });

  test("rejects a rejected template", () => {
    expect(() => assertTemplateApproved({ name: "old_promo", status: "REJECTED" })).toThrow(/not approved/i);
  });
});

test.describe("Token isolation", () => {
  test("WhatsApp user tokens are unreadable with the anon key", async () => {
    // Same guarantee as Meta Ads' meta_user_tokens/meta_page_tokens: the
    // table has no RLS policy and no grants, so the browser-facing anon key
    // can never read the org's WhatsApp access token, even for its own org.
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54331",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const tokens = await anon.from("whatsapp_user_tokens").select("user_access_token");
    expect(tokens.error).toBeTruthy();
    expect(tokens.data).toBeNull();
  });

  test("whatsapp_available_numbers is admin-only, not readable by anon", async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54331",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    // No signed-in session at all here, so current_org_id() is null and the
    // admin-only policy excludes every row regardless of org.
    const result = await anon.from("whatsapp_available_numbers").select("id");
    expect(result.data ?? []).toHaveLength(0);
  });
});

test.describe("Sending pipeline (driven through the real UI, demo mode)", () => {
  // With no real WhatsApp connection the deployment runs the mock adapter
  // ("Demo mode"). These tests drive the same UI and services a live number
  // would, and assert the product never claims a message was delivered.

  async function leadIdByName(first: string) {
    const db = admin();
    const orgId = await getOrgId(db);
    const { data } = await db.from("leads").select("id").eq("org_id", orgId).eq("first_name", first).limit(1).single();
    return data!.id as string;
  }

  test("sends a template, labels it demo mode, and shows it in the conversation", async ({ page }) => {
    const leadId = await leadIdByName("Sneha");
    await login(page, "admin@summitsales.test");
    await page.goto(`/leads/${leadId}`);

    await expect(page.getByText("Demo mode").first()).toBeVisible();
    await page.getByRole("button", { name: "Send WhatsApp" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/not actually delivered/i)).toBeVisible();
    await dialog.getByLabel("Variable {{1}}").fill("Sneha");
    await dialog.getByRole("button", { name: "Send", exact: true }).click();

    await expect(page.getByText(/demo mode — not delivered/i).first()).toBeVisible();
    // The composer defaults to the first approved template (alphabetical).
    await expect(page.getByText("Template: follow_up_check_in").first()).toBeVisible();
    await expect(page.getByText(/just checking in/i).first()).toBeVisible();
  });

  test("a customer's reply opens the free-text window; STOP closes the door", async ({ page }) => {
    const leadId = await leadIdByName("Arjun");
    await login(page, "admin@summitsales.test");
    await page.goto(`/leads/${leadId}`);

    // No reply yet: only templates are allowed.
    await page.getByRole("button", { name: "Send WhatsApp" }).click();
    await page.getByRole("dialog").getByRole("tab", { name: "Reply" }).click();
    await expect(page.getByRole("dialog").getByText(/24-hour reply window is closed/i)).toBeVisible();
    await page.keyboard.press("Escape");

    // The customer replies (simulated through the real inbound pipeline).
    await page.getByRole("button", { name: "Simulate customer reply" }).click();
    await page.getByRole("dialog").getByLabel("Their message").fill("Yes please, call me tomorrow");
    await page.getByRole("button", { name: "Deliver reply" }).click();
    await expect(page.getByText("Yes please, call me tomorrow").first()).toBeVisible();
    await expect(page.getByText(/WhatsApp reply from/).first()).toBeVisible();

    // Now free text is allowed.
    await page.getByRole("button", { name: "Send WhatsApp" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Message" }).fill("Sure — what time suits you?");
    await dialog.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Sure — what time suits you?").first()).toBeVisible();

    // STOP is honoured: consent flips and sending is blocked.
    await page.getByRole("button", { name: "Simulate customer reply" }).click();
    await page.getByRole("dialog").getByLabel("Their message").fill("STOP");
    await page.getByRole("button", { name: "Deliver reply" }).click();
    await expect(page.getByText("Opted out").first()).toBeVisible();
    await page.getByRole("button", { name: "Send WhatsApp" }).click();
    await expect(page.getByRole("dialog").getByText(/opted out of WhatsApp/i)).toBeVisible();
  });

  test("a delivery failure is shown to the user and recorded, never silently dropped", async ({ page }) => {
    const db = admin();
    const orgId = await getOrgId(db);
    // The mock adapter rejects numbers ending 0000 ("not on WhatsApp").
    const { data: lead } = await db.from("leads").select("id, contact_id").eq("org_id", orgId).eq("first_name", "Aditya").limit(1).single();
    const original = await db.from("contacts").select("phone, phone_normalized").eq("id", lead!.contact_id as string).single();
    const badPhone = `+9198765${String(Date.now()).slice(-5, -1)}0`.slice(0, 13).replace(/.$/, "0");
    await db.from("contacts").update({ phone: "+919876500000", phone_normalized: "+919876500000" }).eq("id", lead!.contact_id as string);

    try {
      await login(page, "admin@summitsales.test");
      await page.goto(`/leads/${lead!.id}`);
      await page.getByRole("button", { name: "Send WhatsApp" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Variable {{1}}").fill("Aditya");
      await dialog.getByRole("button", { name: "Send", exact: true }).click();

      await expect(page.getByText(/this number is not on whatsapp/i).first()).toBeVisible();

      const { data: messages } = await db.from("whatsapp_messages").select("status, error_code").eq("lead_id", lead!.id as string);
      expect(messages?.map((m) => m.status)).toEqual(["failed"]);
      expect(messages?.[0].error_code).toBe("invalid_recipient");
      void badPhone;
    } finally {
      await db.from("contacts").update({ phone: original.data!.phone, phone_normalized: original.data!.phone_normalized }).eq("id", lead!.contact_id as string);
      await db.from("whatsapp_messages").delete().eq("lead_id", lead!.id as string);
    }
  });
});
