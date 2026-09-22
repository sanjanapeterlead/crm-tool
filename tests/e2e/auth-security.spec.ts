import { test, expect, type Page } from "@playwright/test";

// Authentication edges: the open-redirect guard, the full password-reset flow
// (reading the real email from the local Mailpit inbox), and team role
// management through the UI. Needs the local Supabase stack (`npm run db:start`).

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54334";
const PASSWORD = "password123";

async function signup(page: Page, orgName: string, email: string, password = PASSWORD) {
  await page.goto("/signup");
  await page.getByLabel("Organization name").fill(orgName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /create organization/i }).click();
  await expect(page).toHaveURL(/\/login/);
}

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Polls the local Mailpit inbox for the first message to `email`, returning its text body. */
async function latestMailTo(email: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    if (search.ok) {
      const { messages } = (await search.json()) as { messages?: Array<{ ID: string }> };
      if (messages?.length) {
        const message = await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`);
        const body = (await message.json()) as { Text?: string; HTML?: string };
        return `${body.Text ?? ""}\n${body.HTML ?? ""}`;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No email arrived for ${email}`);
}

test.describe("Post-login redirect (open-redirect guard)", () => {
  for (const evil of ["https://evil.example/phish", "//evil.example", "/\\evil.example"]) {
    test(`ignores a hostile redirectTo: ${evil}`, async ({ page, baseURL }) => {
      await page.goto(`/login?redirectTo=${encodeURIComponent(evil)}`);
      await page.getByLabel("Email").fill("admin@summitsales.test");
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();

      await expect(page).toHaveURL(`${baseURL}/`);
      expect(new URL(page.url()).hostname).not.toContain("evil");
    });
  }

  test("still honours a legitimate deep link", async ({ page, baseURL }) => {
    await page.goto("/leads");
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fleads/);
    await page.getByLabel("Email").fill("admin@summitsales.test");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${baseURL}/leads`);
  });
});

test.describe("Password reset", () => {
  test("emails a link, sets a new password, and the old one stops working", async ({ page, browser }) => {
    test.slow();
    const stamp = Date.now();
    const email = `reset_${stamp}@example.com`;
    await signup(page, `Reset Org ${stamp}`, email);

    // A different browser session asks for the reset (the person is locked out).
    const context = await browser.newContext();
    const forgot = await context.newPage();
    await forgot.goto("/login");
    await forgot.getByRole("link", { name: "Forgot password?" }).click();
    // Wait for the navigation: the login page has an Email field too, and filling it early
    // would put the address in the wrong form.
    await forgot.waitForURL(/\/forgot-password/);
    await forgot.getByLabel("Email").fill(email);
    await forgot.getByRole("button", { name: "Send reset link" }).click();
    await expect(forgot.getByText(/if an account exists/i)).toBeVisible();

    // The link in the real email signs them in and lands on the new-password form.
    const mail = await latestMailTo(email);
    const link = mail.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]+/)?.[0]?.replace(/&amp;/g, "&");
    expect(link, "reset link in the email").toBeTruthy();
    await forgot.goto(link!);
    await expect(forgot.getByText("Choose a new password")).toBeVisible();

    // Mismatched passwords are refused; matching ones are accepted.
    await forgot.getByLabel("New password", { exact: true }).fill("brand-new-pass-1");
    await forgot.getByLabel("Confirm new password").fill("something-else-1");
    await forgot.getByRole("button", { name: "Set new password" }).click();
    await expect(forgot.getByText(/passwords don't match/i)).toBeVisible();

    await forgot.getByLabel("New password", { exact: true }).fill("brand-new-pass-1");
    await forgot.getByLabel("Confirm new password").fill("brand-new-pass-1");
    await forgot.getByRole("button", { name: "Set new password" }).click();
    await expect(forgot).toHaveURL(/\/$/);
    await context.close();

    // Old password is dead, new one works.
    const fresh = await (await browser.newContext()).newPage();
    await login(fresh, email, PASSWORD);
    await expect(fresh.getByText(/invalid email or password/i)).toBeVisible();
    await login(fresh, email, "brand-new-pass-1");
    await expect(fresh).toHaveURL(/\/$/);
  });

  test("answers identically for an address with no account (no user enumeration)", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(`nobody_${Date.now()}@example.com`);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/if an account exists/i)).toBeVisible();
  });

  test("an expired or forged reset link says so instead of signing anyone in", async ({ page }) => {
    await page.goto("/auth/confirm?code=not-a-real-code&next=/reset-password");
    await expect(page).toHaveURL(/\/forgot-password\?error=expired/);
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
  });

  test("the reset page is unreachable without the emailed link", async ({ page }) => {
    await page.goto("/reset-password");
    // The proxy stops an anonymous visitor at the door before the page even runs.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Choose a new password")).toHaveCount(0);
  });

  test("/auth/confirm can't be used as an open redirect", async ({ page }) => {
    await page.goto("/auth/confirm?code=bad&next=https://evil.example");
    expect(new URL(page.url()).hostname).not.toContain("evil");
  });
});

test.describe("Team roles through the UI", () => {
  test("an admin invites a manager, promotes and demotes people, and can't demote the last admin", async ({ page }) => {
    test.slow();
    const stamp = Date.now();
    const adminEmail = `roles_${stamp}@example.com`;
    const managerEmail = `manager_${stamp}@example.com`;
    await signup(page, `Roles Org ${stamp}`, adminEmail);
    await login(page, adminEmail);
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/team");
    await page.getByRole("button", { name: "Invite team member" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email").fill(managerEmail);
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: /^Manager/ }).click();
    await dialog.getByRole("button", { name: "Send invitation" }).click();

    const row = page.getByRole("row", { name: new RegExp(managerEmail) });
    await expect(row).toBeVisible();
    await expect(row.getByRole("combobox", { name: /Role for/ })).toContainText("Manager");

    // Demote them to salesperson from the Team page.
    await row.getByRole("combobox", { name: /Role for/ }).click();
    await page.getByRole("option", { name: "Salesperson" }).click();
    await expect(page.getByText(/is now salesperson/i)).toBeVisible();
    await expect(row.getByRole("combobox", { name: /Role for/ })).toContainText("Salesperson");

    // The founder is the only admin: demoting themselves is refused, with a reason.
    const own = page.getByRole("row", { name: new RegExp(adminEmail) });
    await own.getByRole("combobox", { name: /Role for/ }).click();
    await page.getByRole("option", { name: "Manager" }).click();
    await expect(page.getByText(/only admin/i)).toBeVisible();
    await expect(own.getByRole("combobox", { name: /Role for/ })).toContainText("Admin");

    // Every change is in the audit log.
    await page.goto("/settings/integrations");
    await expect(page.getByText(`Invited ${managerEmail} as manager`)).toBeVisible();
    await expect(page.getByText(/from manager to salesperson/)).toBeVisible();
  });
});
