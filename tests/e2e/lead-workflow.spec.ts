import { test, expect, type Page } from "@playwright/test";

// Matches the acceptance scenario in the project spec: manual lead entry
// through assignment, meeting, outcome, follow-up, and dashboard reflection.
// Requires `npm run db:reset` to have been run against the local Supabase
// stack so the seeded admin/salesperson accounts exist.

const ADMIN_EMAIL = "admin@summitsales.test";
const PASSWORD = "password123";
const SALESPERSON_NAME = "Jordan Blake";
const LEAD_FIRST_NAME = "Sanjana";
const LEAD_LAST_NAME = "Peter";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

test("full lead lifecycle: create -> assign -> meeting -> follow-up -> converted", async ({ page }) => {
  await login(page, ADMIN_EMAIL);

  // 1. Create a lead.
  await page.goto("/leads");
  await page.getByRole("button", { name: "Add Lead" }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByLabel("First name").fill(LEAD_FIRST_NAME);
  await addDialog.getByLabel("Last name").fill(LEAD_LAST_NAME);
  await addDialog.getByLabel("Phone").fill("+1-555-9999");
  await addDialog.getByLabel("Email").fill("sanjana.peter.e2e@example.com");

  // Assign to salesperson.
  const assignTrigger = addDialog.getByRole("combobox").last();
  await assignTrigger.click();
  await page.getByRole("option", { name: SALESPERSON_NAME }).click();

  await addDialog.getByRole("button", { name: "Create Lead" }).click();

  // 2. Lead detail page opens. Capture its URL — the seed data also
  // includes a "Sanjana Peter" lead, so name-based lookups elsewhere would
  // be ambiguous; navigating back to this exact URL is not.
  await expect(page.getByRole("heading", { name: `${LEAD_FIRST_NAME} ${LEAD_LAST_NAME}` })).toBeVisible();
  await expect(page.getByText(`Assigned to ${SALESPERSON_NAME}`)).toBeVisible();
  const leadUrl = page.url();

  // 3. Verify it shows up in the Leads list (search narrows to just this lead).
  await page.goto("/leads?search=sanjana.peter.e2e");
  await expect(page.getByRole("link", { name: `${LEAD_FIRST_NAME} ${LEAD_LAST_NAME}` })).toBeVisible();
  await page.goto(leadUrl);

  // 4. Change status to Contacted.
  await page.getByRole("button", { name: "Change Status" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "Contacted", exact: true }).click();
  await dialog.getByRole("button", { name: "Update status" }).click();
  await expect(page.getByText("Contacted", { exact: true }).first()).toBeVisible();

  // 5. Schedule / log a meeting.
  await page.getByRole("button", { name: "Schedule Meeting" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Google Meet / video link").fill("https://meet.google.com/abc-defg-hij");
  await dialog.getByRole("button", { name: "Log meeting" }).click();
  await expect(page.getByText("No meetings yet.")).toHaveCount(0);

  // 6. Change status to Meeting Completed.
  await page.getByRole("button", { name: "Change Status" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "Meeting Completed", exact: true }).click();
  await dialog.getByRole("button", { name: "Update status" }).click();

  // 7. Add a note.
  await page.getByRole("button", { name: "Add Note" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("What happened? What's next?").fill("Great call — sending proposal next.");
  await dialog.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Great call — sending proposal next.")).toBeVisible();

  // 8. Create a follow-up due today.
  await page.getByRole("button", { name: "Add Follow-up" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: SALESPERSON_NAME }).click();
  await dialog.getByLabel("What needs to happen?").fill("Call to review the proposal.");
  await dialog.getByRole("button", { name: "Create follow-up" }).click();

  // 9. Verify it appears on the Follow-ups page (Today view).
  await page.goto("/followups?view=today");
  await expect(page.getByText("Call to review the proposal.")).toBeVisible();

  // 10. Mark the follow-up completed.
  const followupRow = page.getByText("Call to review the proposal.").locator("..").locator("..");
  await followupRow.getByRole("button").first().click();
  await expect(page.getByText("Call to review the proposal.")).toHaveCount(0);

  // 11. Verify the full timeline on the lead page.
  await page.goto(leadUrl);
  await expect(page.getByText("Lead created")).toBeVisible();
  await expect(page.getByText("Assigned to salesperson")).toBeVisible();
  await expect(page.getByText("Meeting scheduled")).toBeVisible();
  await expect(page.getByText("Note added")).toBeVisible();
  await expect(page.getByText("Follow-up created")).toBeVisible();
  await expect(page.getByText("Follow-up completed")).toBeVisible();

  // 12. Change lead to Converted.
  await page.getByRole("button", { name: "Change Status" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "Converted", exact: true }).click();
  await dialog.getByRole("button", { name: "Update status" }).click();

  // 13. Dashboard reflects the change.
  await page.goto("/");
  await expect(page.getByText("Converted", { exact: true }).first()).toBeVisible();
});
