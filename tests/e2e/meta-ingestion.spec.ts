import { createHmac } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  extractCustomAnswers,
  mapLeadContact,
  mapLeadSource,
} from "../../src/lib/integrations/meta/mapping";

// Covers the Meta Lead Ads ingestion path. Requires `npm run db:reset` against
// the local Supabase stack, and the META_* placeholders from .env.example
// present in .env.local (the app secret below must match META_APP_SECRET).

const APP_SECRET = process.env.META_APP_SECRET ?? "local-dev-app-secret";
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "local-dev-verify-token";
const WEBHOOK_PATH = "/api/webhooks/meta";

const TEST_PAGE_ID = "111222333444555";

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

function sign(body: string) {
  return `sha256=${createHmac("sha256", APP_SECRET).update(body, "utf8").digest("hex")}`;
}

function leadgenBody(leadgenId: string, pageId: string) {
  return JSON.stringify({
    object: "page",
    entry: [
      {
        id: pageId,
        time: 1758000000,
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: leadgenId,
              page_id: pageId,
              form_id: "form_abc",
              created_time: 1758000000,
            },
          },
        ],
      },
    ],
  });
}

function postWebhook(request: APIRequestContext, body: string, signature?: string) {
  return request.post(WEBHOOK_PATH, {
    headers: {
      "content-type": "application/json",
      ...(signature ? { "x-hub-signature-256": signature } : {}),
    },
    data: body,
  });
}

test.describe("Meta lead form field mapping", () => {
  test("splits a full_name field into first and last name", () => {
    const contact = mapLeadContact([
      { name: "full_name", values: ["Sanjana Peter"] },
      { name: "email", values: ["sanjana@example.com"] },
      { name: "phone_number", values: ["+1-555-0100"] },
    ]);

    expect(contact).toEqual({
      firstName: "Sanjana",
      lastName: "Peter",
      email: "sanjana@example.com",
      phone: "+1-555-0100",
    });
  });

  test("keeps multi-word surnames intact", () => {
    const contact = mapLeadContact([
      { name: "full_name", values: ["Maria del Carmen Rodriguez"] },
      { name: "email", values: ["maria@example.com"] },
    ]);

    expect(contact.firstName).toBe("Maria");
    expect(contact.lastName).toBe("del Carmen Rodriguez");
  });

  test("prefers explicit first/last fields over full_name", () => {
    const contact = mapLeadContact([
      { name: "first_name", values: ["Jordan"] },
      { name: "last_name", values: ["Blake"] },
      { name: "full_name", values: ["Should Be Ignored"] },
      { name: "email", values: ["jordan@example.com"] },
    ]);

    expect(contact.firstName).toBe("Jordan");
    expect(contact.lastName).toBe("Blake");
  });

  test("recognizes alias field names advertisers commonly use", () => {
    const contact = mapLeadContact([
      { name: "NAME", values: ["Priya Shah"] },
      { name: "email_address", values: ["priya@example.com"] },
      { name: "mobile_number", values: ["+1-555-0199"] },
    ]);

    expect(contact.firstName).toBe("Priya");
    expect(contact.email).toBe("priya@example.com");
    expect(contact.phone).toBe("+1-555-0199");
  });

  test("falls back to a contact value when the form collects no name", () => {
    const contact = mapLeadContact([{ name: "phone_number", values: ["+1-555-0123"] }]);

    expect(contact.firstName).toBe("+1-555-0123");
    expect(contact.lastName).toBeNull();
  });

  test("ignores blank values rather than storing empty strings", () => {
    const contact = mapLeadContact([
      { name: "full_name", values: ["   "] },
      { name: "email", values: [""] },
      { name: "phone_number", values: ["+1-555-0144"] },
    ]);

    expect(contact.email).toBeNull();
    expect(contact.phone).toBe("+1-555-0144");
  });

  test("maps the platform onto a CRM lead source", () => {
    expect(mapLeadSource("ig")).toBe("Instagram");
    expect(mapLeadSource("fb")).toBe("Facebook Ad");
    expect(mapLeadSource(undefined)).toBe("Facebook Ad");
  });

  test("surfaces custom questions but not mapped contact fields", () => {
    const custom = extractCustomAnswers([
      { name: "full_name", values: ["Sanjana Peter"] },
      { name: "email", values: ["sanjana@example.com"] },
      { name: "what_is_your_budget", values: ["$10k-$25k"] },
      { name: "preferred_contact_time", values: ["Mornings"] },
    ]);

    expect(custom.map((f) => f.name)).toEqual([
      "what_is_your_budget",
      "preferred_contact_time",
    ]);
  });
});

test.describe("Meta webhook endpoint", () => {
  test("completes Meta's subscription handshake", async ({ request }) => {
    const response = await request.get(
      `${WEBHOOK_PATH}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=echo-me-42`
    );

    expect(response.status()).toBe(200);
    expect(await response.text()).toBe("echo-me-42");
  });

  test("rejects a handshake with the wrong verify token", async ({ request }) => {
    const response = await request.get(
      `${WEBHOOK_PATH}?hub.mode=subscribe&hub.verify_token=not-the-token&hub.challenge=echo-me-42`
    );

    expect(response.status()).toBe(403);
  });

  test("rejects an unsigned payload", async ({ request }) => {
    const response = await postWebhook(request, leadgenBody("unsigned_1", TEST_PAGE_ID));
    expect(response.status()).toBe(401);
  });

  test("rejects a payload whose signature does not match the body", async ({ request }) => {
    const body = leadgenBody("tampered_1", TEST_PAGE_ID);
    // A signature that is valid for different content must not authorize this body.
    const response = await postWebhook(request, body, sign(leadgenBody("other", TEST_PAGE_ID)));

    expect(response.status()).toBe(401);
  });

  test("does not persist anything for an unsigned payload", async ({ request }) => {
    const leadgenId = `unsigned_persist_${Date.now()}`;
    await postWebhook(request, leadgenBody(leadgenId, TEST_PAGE_ID));

    const { data } = await admin()
      .from("meta_webhook_events")
      .select("id")
      .eq("leadgen_id", leadgenId);

    expect(data ?? []).toHaveLength(0);
  });

  test("logs a signed event for an unknown Page instead of dropping it", async ({ request }) => {
    const leadgenId = `unknown_page_${Date.now()}`;
    const body = leadgenBody(leadgenId, "000000000000000");

    const response = await postWebhook(request, body, sign(body));
    expect(response.status()).toBe(200);

    const { data } = await admin()
      .from("meta_webhook_events")
      .select("status, error, signature_valid, org_id")
      .eq("leadgen_id", leadgenId)
      .single();

    expect(data?.status).toBe("ignored");
    expect(data?.signature_valid).toBe(true);
    expect(data?.org_id).toBeNull();
    expect(data?.error).toContain("No connected organization");
  });

  test("resolves a connected Page to its org and records why ingestion failed", async ({
    request,
  }) => {
    const db = admin();
    const orgId = await getOrgId(db);
    const leadgenId = `connected_page_${Date.now()}`;

    // A connected Page with a deliberately invalid token: the pipeline should
    // get as far as calling the Graph API and record Meta's rejection.
    await db.from("meta_pages").upsert(
      {
        org_id: orgId,
        page_id: TEST_PAGE_ID,
        page_name: "Test Page",
        webhook_subscribed: true,
        is_active: true,
      },
      { onConflict: "page_id" }
    );
    await db.from("meta_page_tokens").upsert(
      { page_id: TEST_PAGE_ID, org_id: orgId, page_access_token: "invalid-token" },
      { onConflict: "page_id" }
    );

    try {
      const body = leadgenBody(leadgenId, TEST_PAGE_ID);
      const response = await postWebhook(request, body, sign(body));
      expect(response.status()).toBe(200);

      const { data } = await db
        .from("meta_webhook_events")
        .select("status, error, org_id")
        .eq("leadgen_id", leadgenId)
        .single();

      expect(data?.org_id).toBe(orgId);
      expect(data?.status).toBe("failed");
      expect(data?.error).toBeTruthy();
    } finally {
      await db.from("meta_page_tokens").delete().eq("page_id", TEST_PAGE_ID);
      await db.from("meta_pages").delete().eq("page_id", TEST_PAGE_ID);
      await db.from("meta_webhook_events").delete().eq("leadgen_id", leadgenId);
    }
  });

  test("ignores a paused Page without calling Meta", async ({ request }) => {
    const db = admin();
    const orgId = await getOrgId(db);
    const leadgenId = `paused_page_${Date.now()}`;

    await db.from("meta_pages").upsert(
      {
        org_id: orgId,
        page_id: TEST_PAGE_ID,
        page_name: "Test Page",
        webhook_subscribed: true,
        is_active: false,
      },
      { onConflict: "page_id" }
    );

    try {
      const body = leadgenBody(leadgenId, TEST_PAGE_ID);
      const response = await postWebhook(request, body, sign(body));
      expect(response.status()).toBe(200);

      const { data } = await db
        .from("meta_webhook_events")
        .select("status, error")
        .eq("leadgen_id", leadgenId)
        .single();

      expect(data?.status).toBe("ignored");
      expect(data?.error).toContain("paused");
    } finally {
      await db.from("meta_pages").delete().eq("page_id", TEST_PAGE_ID);
      await db.from("meta_webhook_events").delete().eq("leadgen_id", leadgenId);
    }
  });
});

test.describe("Token isolation", () => {
  test("page access tokens are unreadable with the anon key", async () => {
    // The browser-facing key must never be able to read a Page token, even
    // for a signed-in user's own org — the tables have no RLS policy and no
    // grants. This is the guarantee that makes storing tokens in Postgres safe.
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54331",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const tokens = await anon.from("meta_page_tokens").select("page_access_token");
    expect(tokens.error).toBeTruthy();
    expect(tokens.data).toBeNull();

    const userTokens = await anon.from("meta_user_tokens").select("user_access_token");
    expect(userTokens.error).toBeTruthy();
    expect(userTokens.data).toBeNull();
  });
});
