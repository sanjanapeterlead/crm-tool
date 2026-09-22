import { test, expect, type Page } from "@playwright/test";

// What each role lands on: a salesperson's work queue, an owner's "needs
// attention" screen. Depends on the demo seed (supabase/seed.sql), which puts
// uncontacted leads, overdue and due-today follow-ups on the reps.

const PASSWORD = "password123";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

test.describe("Salesperson home is a work queue", () => {
  test("shows new leads to contact, overdue follow-ups, and a Start next lead action — not charts", async ({ page }) => {
    await login(page, "jordan@summitsales.test");

    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start next lead" })).toBeVisible();
    await expect(page.getByText("Contact these first")).toBeVisible();
    await expect(page.getByText("Rohan Mehta")).toBeVisible(); // seeded: assigned to Jordan, never contacted
    // Seeded: Vikram's follow-up is dated yesterday (overdue); Karan's is due at 23:00 today.
    await expect(page.getByText("Overdue").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Vikram Singh" })).toBeVisible();
    await expect(page.getByText("Due later today")).toBeVisible();
    await expect(page.getByRole("link", { name: "Karan Malhotra" })).toBeVisible();

    // No owner-only content.
    await expect(page.getByText("Team activity")).toHaveCount(0);
    await expect(page.getByText("Lead sources")).toHaveCount(0);
  });

  test("Start next lead opens the lead that most needs attention", async ({ page }) => {
    await login(page, "jordan@summitsales.test");
    await page.getByRole("link", { name: "Start next lead" }).click();
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
    // The lead page offers the salesperson's next actions straight away.
    await expect(page.getByRole("button", { name: "Log call" })).toBeVisible();
  });

  test("a salesperson does not see the team or settings navigation, nor a colleague's leads", async ({ page }) => {
    await login(page, "jordan@summitsales.test");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Today" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Team" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);

    await page.goto("/leads");
    // Seeded leads owned by Priya (e.g. Kavya Nair) must not appear for Jordan.
    await expect(page.getByRole("link", { name: "Kavya Nair" })).toHaveCount(0);
  });

  test("the salesperson can claim an unassigned lead but cannot reassign one", async ({ page }) => {
    await login(page, "jordan@summitsales.test");
    await page.goto("/leads?assigned=unassigned");
    await page.getByRole("link", { name: "Ananya Iyer" }).click(); // seeded, unassigned
    await expect(page.getByRole("button", { name: "Claim lead" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Assign|Reassign)$/ })).toHaveCount(0);
  });
});

test.describe("Owner home answers 'what is being neglected'", () => {
  test("leads with uncontacted leads and overdue follow-ups, plus pipeline, sources and team activity", async ({ page }) => {
    await login(page, "admin@summitsales.test");

    await expect(page.getByRole("heading", { name: "Summit Sales Group" })).toBeVisible();
    await expect(page.getByText("Leads nobody has contacted")).toBeVisible();
    await expect(page.getByText("Overdue follow-ups")).toBeVisible();
    await expect(page.getByText("Waiting the longest for a first contact")).toBeVisible();
    await expect(page.getByText("Pipeline overview")).toBeVisible();
    await expect(page.getByText(/Lead sources/)).toBeVisible();
    await expect(page.getByText(/Team activity/)).toBeVisible();
    await expect(page.getByRole("cell", { name: "Jordan Blake" })).toBeVisible();
  });

  test("the attention cards link to the filtered lists", async ({ page }) => {
    await login(page, "admin@summitsales.test");
    await page.getByRole("link", { name: /Leads nobody has contacted/ }).click();
    await expect(page).toHaveURL(/uncontacted=1/);
    await expect(page.getByRole("button", { name: "Not yet contacted", pressed: true })).toBeVisible();
  });

  test("a manager sees the same owner dashboard; My Today is their own queue", async ({ page }) => {
    await login(page, "manager@summitsales.test");
    await expect(page.getByText("Leads nobody has contacted")).toBeVisible();
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My Today" }).click();
    await expect(page.getByRole("heading", { name: "My Today" })).toBeVisible();
  });
});

test.describe("Search and filters", () => {
  test("finds a lead by name and by phone typed differently, and narrows by stage", async ({ page }) => {
    await login(page, "admin@summitsales.test");

    await page.goto("/leads?search=Ishita");
    await expect(page.getByRole("link", { name: "Ishita Bansal" })).toBeVisible();

    await page.goto("/leads?search=98200%2010009"); // seeded +919820010009
    await expect(page.getByRole("link", { name: "Ishita Bansal" })).toBeVisible();

    await page.goto("/leads?due=overdue");
    await expect(page.getByRole("link", { name: "Meera Joshi" })).toBeVisible();

    await page.goto("/leads?state=won");
    await expect(page.getByRole("link", { name: "Rahul Gupta" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ishita Bansal" })).toHaveCount(0);
  });
});
