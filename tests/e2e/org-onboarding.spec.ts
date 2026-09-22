import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Covers the org onboarding path added because there was previously no
// product way to create a second organization or add a salesperson — every
// user before this existed because seed.sql inserted them via raw SQL.
// Requires `npm run db:reset` against the local Supabase stack.

const PASSWORD = "password123!";

// Each test here chains several real bcrypt hashes (signInWithPassword,
// createUser) and GoTrue admin API round trips against local Supabase —
// meaningfully slower than the rest of the app's tests, which touch auth at
// most once per test.
test.slow();

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54331",
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Without this, a caller that immediately navigates elsewhere can race
  // the login redirect and land back on /login still unauthenticated —
  // real bcrypt hashing on both signInWithPassword and createUser makes
  // this a live race in this suite specifically, not a hypothetical one.
  await expect(page).toHaveURL("/", { timeout: 15_000 });
}

async function signup(page: Page, orgName: string, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Organization name").fill(orgName);
  await page.getByLabel("Your email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page).toHaveURL(/\/login\?signedUp=1/);
}

test.describe("Organization signup", () => {
  test("creates an isolated org whose admin cannot see the seeded org's leads", async ({ page }) => {
    const email = `owner_${Date.now()}@example.com`;
    const orgName = `Test Org ${Date.now()}`;

    await signup(page, orgName, email);
    await login(page, email, PASSWORD);
    await expect(page).toHaveURL("/");

    await page.goto("/leads");
    // The seeded "Summit Sales Group" org has 15+ sample leads. A brand-new
    // org's leads list must be empty, not merely "not showing someone
    // else's leads by coincidence" — this is the tenant-isolation guarantee.
    await expect(page.getByText("Sanjana Peter")).not.toBeVisible();
    await expect(page.getByText(/no leads|nothing here/i).or(page.locator("table"))).toBeVisible();

    const db = admin();
    const { data: org } = await db.from("organizations").select("id").eq("name", orgName).single();
    const { count } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org!.id as string);
    expect(count).toBe(0);
  });

  test("seeds the default V1 pipeline stages for a new org", async ({ page }) => {
    const email = `pipeline_${Date.now()}@example.com`;
    await signup(page, `Pipeline Org ${Date.now()}`, email);
    await login(page, email, PASSWORD);

    await page.goto("/pipeline");
    for (const stage of [
      "New Lead",
      "Contact Needed",
      "Contacted",
      "Interested",
      "Meeting Scheduled",
      "Meeting Completed",
      "Payment Pending",
      "Won",
      "Lost",
    ]) {
      await expect(page.getByText(stage, { exact: true })).toBeVisible();
    }
  });

  test("rejects a signup with an email already registered on the platform", async ({ page }) => {
    const email = `dup_${Date.now()}@example.com`;
    await signup(page, `First Org ${Date.now()}`, email);

    await page.goto("/signup");
    await page.getByLabel("Organization name").fill("Second Org");
    await page.getByLabel("Your email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create organization" }).click();

    await expect(page.getByText(/already exists/i)).toBeVisible();
    // Must still be on /signup, not have silently created a second org for the same person.
    await expect(page).toHaveURL(/\/signup/);
  });
});

test.describe("Team management", () => {
  test("inviting a salesperson adds them to the org as an active salesperson", async ({ page }) => {
    const db = admin();
    const adminEmail = `teamadmin_${Date.now()}@example.com`;
    const inviteeEmail = `invitee_${Date.now()}@example.com`;

    await signup(page, `Invite Org ${Date.now()}`, adminEmail);
    await login(page, adminEmail, PASSWORD);

    await page.goto("/team");
    await page.getByRole("button", { name: "Invite team member" }).click();
    await page.getByLabel("Email").fill(inviteeEmail);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByText(/invitation sent/i)).toBeVisible();

    // Scoped to the table: the just-shown toast also contains this email
    // (truncated), which would otherwise make an unscoped text match ambiguous.
    await expect(page.getByRole("cell", { name: inviteeEmail })).toBeVisible();

    const { data: invitedUser } = await db
      .from("profiles")
      .select("id")
      .eq("email", inviteeEmail)
      .single();
    const { data: membership } = await db
      .from("organization_members")
      .select("role, is_active")
      .eq("user_id", invitedUser!.id as string)
      .single();

    expect(membership?.role).toBe("salesperson");
    expect(membership?.is_active).toBe(true);
  });

  test("an admin has no deactivate control on their own row", async ({ page }) => {
    const email = `selfguard_${Date.now()}@example.com`;
    await signup(page, `Self Guard Org ${Date.now()}`, email);
    await login(page, email, PASSWORD);

    await page.goto("/team");
    await expect(page.getByRole("row", { name: new RegExp(email) })).not.toContainText("Deactivate");
  });

  /** A directly-created member (bypassing the invite email flow) with a known password. */
  async function createMember(db: ReturnType<typeof admin>, orgId: string, email: string) {
    const { data: created } = await db.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    await db.from("organization_members").insert({ org_id: orgId, user_id: created!.user!.id, role: "salesperson" });
    return created!.user!.id as string;
  }

  async function getOrgId(db: ReturnType<typeof admin>, adminEmail: string): Promise<string> {
    const { data: adminProfile } = await db.from("profiles").select("id").eq("email", adminEmail).single();
    const { data: orgRow } = await db
      .from("organization_members")
      .select("org_id")
      .eq("user_id", adminProfile!.id as string)
      .single();
    return orgRow!.org_id as string;
  }

  test("deactivating a member prevents them from logging in afterward", async ({ page, browser }) => {
    const db = admin();
    const adminEmail = `deactadmin_${Date.now()}@example.com`;
    const memberEmail = `member_${Date.now()}@example.com`;

    await signup(page, `Deactivation Org ${Date.now()}`, adminEmail);
    await login(page, adminEmail, PASSWORD);
    const orgId = await getOrgId(db, adminEmail);
    await createMember(db, orgId, memberEmail);

    await page.goto("/team");
    const row = page.getByRole("row", { name: new RegExp(memberEmail) });
    await row.getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByText(/access revoked/i)).toBeVisible();
    await expect(row).toContainText("Deactivated");

    // A fresh, unauthenticated context — `page` is still signed in as the
    // admin, and /login redirects an already-authenticated visitor straight
    // back to "/" without ever rendering the form.
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await memberPage.goto("/login");
    await memberPage.getByLabel("Email").fill(memberEmail);
    await memberPage.getByLabel("Password").fill(PASSWORD);
    await memberPage.getByRole("button", { name: "Sign in" }).click();
    // Supabase's ban blocks new sign-ins too, not just existing sessions —
    // the deactivated member must not reach the dashboard.
    await expect(memberPage).toHaveURL(/\/login/);
    await expect(memberPage).not.toHaveURL("/");
    await memberContext.close();
  });

  test("reactivating a member restores their ability to log in", async ({ page, browser }) => {
    const db = admin();
    const adminEmail = `reactadmin_${Date.now()}@example.com`;
    const memberEmail = `member_${Date.now()}@example.com`;

    await signup(page, `Reactivation Org ${Date.now()}`, adminEmail);
    await login(page, adminEmail, PASSWORD);
    const orgId = await getOrgId(db, adminEmail);
    const memberId = await createMember(db, orgId, memberEmail);

    // Pre-deactivated directly via the admin client — this test is about the
    // reactivate path, not re-proving deactivation, which the previous test
    // already covers end to end.
    await db.auth.admin.updateUserById(memberId, { ban_duration: "876000h" });
    await db.from("organization_members").update({ is_active: false }).eq("user_id", memberId);

    await page.goto("/team");
    const row = page.getByRole("row", { name: new RegExp(memberEmail) });
    await expect(row).toContainText("Deactivated");
    await row.getByRole("button", { name: "Reactivate" }).click();
    await expect(page.getByText(/access restored/i)).toBeVisible();
    await expect(row).toContainText("Active");

    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await memberPage.goto("/login");
    await memberPage.getByLabel("Email").fill(memberEmail);
    await memberPage.getByLabel("Password").fill(PASSWORD);
    await memberPage.getByRole("button", { name: "Sign in" }).click();
    await expect(memberPage).toHaveURL("/");
    await memberContext.close();
  });

  test("an existing session is rejected on its very next request after deactivation", async ({
    page,
    browser,
  }) => {
    const db = admin();
    const adminEmail = `livedeact_${Date.now()}@example.com`;
    const memberEmail = `member_${Date.now()}@example.com`;

    await signup(page, `Live Deactivation Org ${Date.now()}`, adminEmail);
    await login(page, adminEmail, PASSWORD);
    const orgId = await getOrgId(db, adminEmail);
    await createMember(db, orgId, memberEmail);

    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await login(memberPage, memberEmail, PASSWORD);

    await page.goto("/team");
    await page.getByRole("row", { name: new RegExp(memberEmail) }).getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByText(/access revoked/i)).toBeVisible();

    // The security boundary is Supabase's own session validation, not this
    // app's RLS — the already-logged-in member's next request must fail
    // without them taking any further action.
    await memberPage.goto("/leads");
    await expect(memberPage).toHaveURL(/\/login/);

    await memberContext.close();
  });
});
