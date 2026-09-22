import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "password123";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

test.describe("CSV lead import", () => {
  test("an admin uploads a CSV and the leads appear, but a salesperson can't reach the page", async ({ page }) => {
    await login(page, "admin@summitsales.test");
    await page.goto("/settings/integrations");
    await page.getByRole("link", { name: "File upload" }).click();
    await expect(page).toHaveURL("/settings/integrations/file-upload");

    const unique = Date.now();
    const firstName = `Imported${unique}`;
    const phone = `98${String(unique).slice(-8)}`;
    const csv = `first_name,phone,source\n${firstName},${phone},Referral\n`;

    await page.locator('input[type="file"]').setInputFiles({
      name: "leads.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await page.getByRole("button", { name: "Import leads" }).click();

    await expect(page.getByText("1 row read")).toBeVisible();
    await expect(page.getByText("Created")).toBeVisible();

    await page.goto("/leads");
    await page.getByPlaceholder("Name, phone or email…").fill(firstName);
    await expect(page.getByText(firstName)).toBeVisible();
  });

  test("a salesperson is redirected away from the import page", async ({ page }) => {
    await login(page, "jordan@summitsales.test");
    await page.goto("/settings/integrations/file-upload");
    await expect(page).toHaveURL("/");
  });
});
