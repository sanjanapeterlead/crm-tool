import { test, expect, type Page } from "@playwright/test";

// The V1 happy path, driven through the real UI:
//   manual lead → assign → call outcome → follow-up → stage moves → meeting → Won
// and the Lost path with a required reason. Requires `npm run db:reset` so the
// seeded demo org (Summit Sales Group, demo-mode WhatsApp/Calendar) exists.
//
// Replaces the V0 spec, which raced router.refresh() against router.push() in
// the add-lead dialog (fixed in add-lead-dialog.tsx) and asserted V0 labels.

const ADMIN_EMAIL = "admin@summitsales.test";
const PASSWORD = "password123";
const SALESPERSON_NAME = "Jordan Blake";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

/** A phone number no other test run will have used, so dedupe never turns the create into a merge. */
function freshPhone() {
  return `9${String(Date.now()).slice(-9)}`;
}

async function addLead(page: Page, first: string, last: string, phone: string, email: string, assignTo?: string) {
  await page.goto("/leads");
  await page.getByRole("button", { name: "Add Lead" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("First name").fill(first);
  await dialog.getByLabel("Last name").fill(last);
  await dialog.getByLabel("Phone", { exact: true }).fill(phone);
  await dialog.getByLabel("Email").fill(email);
  if (assignTo) {
    await dialog.getByRole("combobox").last().click();
    await page.getByRole("option", { name: assignTo }).click();
  }
  await dialog.getByRole("button", { name: "Create Lead" }).click();
  await expect(page.getByRole("heading", { name: `${first} ${last}` })).toBeVisible();
}

async function changeStage(page: Page, stage: string, lostReason?: string) {
  await page.getByRole("button", { name: "Change Stage" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: stage, exact: true }).click();
  if (lostReason) {
    await dialog.getByRole("combobox", { name: "Reason for losing this lead" }).click();
    await page.getByRole("option", { name: lostReason, exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Update stage" }).click();
  await expect(dialog).toBeHidden();
}

test("V1 lead-to-sale: create → assign → call → follow-up → stages → meeting → Won", async ({ page }) => {
  const stamp = Date.now();
  const first = "Ananya";
  const last = `Flow${stamp}`;
  await login(page, ADMIN_EMAIL);

  // 1. Manual create, assigned to a salesperson. It lands in the entry stage.
  await addLead(page, first, last, freshPhone(), `ananya.${stamp}@example.com`, SALESPERSON_NAME);
  await expect(page.getByText(`Assigned to ${SALESPERSON_NAME}`, { exact: true })).toBeVisible();
  await expect(page.getByText("New Lead", { exact: true }).first()).toBeVisible();
  const leadUrl = page.url();

  // 2. Log a call: outcome + duration + notes, and the next follow-up in the same step.
  await page.getByRole("button", { name: "Log call" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Connected / Interested" }).click();
  await dialog.getByLabel("Minutes").fill("6");
  await dialog.getByLabel("Notes").fill("Wants UK intake details.");
  await dialog.getByLabel("Reminder").fill("Send the fee sheet");
  await dialog.getByRole("button", { name: "Save call" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Call: Connected / Interested")).toBeVisible();
  await expect(page.getByText("Follow-up created")).toBeVisible();

  // 3. Move through the pipeline. Each move is a timeline event.
  await changeStage(page, "Contacted");
  await expect(page.getByText("Stage changed: New Lead → Contacted")).toBeVisible();
  await changeStage(page, "Interested");
  await expect(page.getByText("Stage changed: Contacted → Interested")).toBeVisible();

  // 4. Schedule a meeting. Demo mode creates a (fake) calendar event and says so.
  await page.getByRole("button", { name: "Schedule Meeting" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/demo mode/i).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Schedule meeting" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Meeting scheduled").first()).toBeVisible();
  await expect(page.getByText(/no real calendar invitation was sent/i)).toBeVisible();

  await changeStage(page, "Meeting Scheduled");
  await changeStage(page, "Meeting Completed");
  await changeStage(page, "Payment Pending");

  // 5. Won. Terminal, no reason needed.
  await changeStage(page, "Won");
  await expect(page.getByText("Stage changed: Payment Pending → Won")).toBeVisible();

  // 6. The whole story is on one timeline.
  await page.goto(leadUrl);
  for (const entry of ["Lead created", "Assigned to salesperson", "Call: Connected / Interested", "Follow-up created", "Meeting scheduled"]) {
    await expect(page.getByText(entry).first()).toBeVisible();
  }

  // 7. The owner's home reflects it: won this week is at least this deal.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Summit Sales Group" })).toBeVisible();
  await expect(page.getByText("Won this week")).toBeVisible();
});

test("marking a lead lost requires a reason and shows it on the lead", async ({ page }) => {
  const stamp = Date.now();
  await login(page, ADMIN_EMAIL);
  await addLead(page, "Manish", `Lost${stamp}`, freshPhone(), `manish.${stamp}@example.com`);

  await page.getByRole("button", { name: "Change Stage" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Lost", exact: true }).click();

  // The reason field appears and blocks submitting until filled.
  await expect(dialog.getByRole("button", { name: "Update stage" })).toBeDisabled();
  await dialog.getByRole("combobox", { name: "Reason for losing this lead" }).click();
  await page.getByRole("option", { name: "Price too high", exact: true }).click();
  await dialog.getByRole("button", { name: "Update stage" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText("Lost: Price too high")).toBeVisible();
  await expect(page.getByText("Reason: Price too high")).toBeVisible();
});

test("entering someone who is already an open lead reuses it instead of duplicating", async ({ page }) => {
  const stamp = Date.now();
  const phone = freshPhone();
  await login(page, ADMIN_EMAIL);
  await addLead(page, "Twice", `Entered${stamp}`, phone, `twice.${stamp}@example.com`);
  const firstUrl = page.url();

  // Same person, phone typed differently (with the country code and spaces).
  await page.goto("/leads");
  await page.getByRole("button", { name: "Add Lead" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("First name").fill("Twice");
  await dialog.getByLabel("Phone", { exact: true }).fill(`+91 ${phone.slice(0, 5)} ${phone.slice(5)}`);
  await dialog.getByRole("button", { name: "Create Lead" }).click();

  await expect(page).toHaveURL(firstUrl);
  await expect(page.getByText("New inquiry").first()).toBeVisible();
});

test("a phone number that isn't one is rejected with a clear message", async ({ page }) => {
  await login(page, ADMIN_EMAIL);
  await page.goto("/leads");
  await page.getByRole("button", { name: "Add Lead" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("First name").fill("Bad");
  await dialog.getByLabel("Phone", { exact: true }).fill("12345");
  await dialog.getByRole("button", { name: "Create Lead" }).click();
  await expect(page.getByText(/enter a valid phone number/i)).toBeVisible();
});
