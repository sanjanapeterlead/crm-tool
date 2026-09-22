import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inviteMember, createOrganizationWithAdmin } from "@/lib/services/organizations";
import { listAuditEvents } from "@/lib/services/audit";
import { setMemberActive, setMemberRole } from "@/lib/services/team";
import { PASSWORD, admin, anonClient, sessionFor } from "./support";

/**
 * Team management against a throwaway organization: invitations with a role,
 * role changes, and the invariant that an org can never be left without an
 * active admin. Every change lands in the audit log.
 */

const stamp = randomUUID().slice(0, 8);
let orgId: string;
let ownerId: string;
let owner: Awaited<ReturnType<typeof sessionFor>>;
const ownerEmail = `owner.${stamp}@team.example`;

beforeAll(async () => {
  const created = await createOrganizationWithAdmin(admin, { orgName: `Team ${stamp}`, email: ownerEmail, password: PASSWORD });
  orgId = created.orgId;
  ownerId = created.userId;
  owner = await sessionFor(ownerEmail);
});

afterAll(async () => {
  await admin.from("organizations").delete().eq("id", orgId);
  const { data } = await admin.from("profiles").select("id").like("email", `%${stamp}@team.example`);
  for (const p of data ?? []) await admin.auth.admin.deleteUser(p.id as string).catch(() => undefined);
});

async function invite(prefix: string, role: "manager" | "salesperson") {
  const email = `${prefix}.${stamp}@team.example`;
  const { userId } = await inviteMember(admin, { orgId, email, role, invitedBy: ownerId });
  return { userId, email };
}

const roleOf = async (userId: string) =>
  (await admin.from("organization_members").select("role").eq("org_id", orgId).eq("user_id", userId).single()).data?.role;

describe("inviting", () => {
  it("adds a manager or a salesperson with the chosen role", async () => {
    const manager = await invite("mgr", "manager");
    const rep = await invite("rep", "salesperson");
    expect(await roleOf(manager.userId)).toBe("manager");
    expect(await roleOf(rep.userId)).toBe("salesperson");
  });

  it("never grants admin through an invitation, even if the caller asks", async () => {
    // The type forbids it; a forged value must be refused at runtime too.
    const email = `sneaky.${stamp}@team.example`;
    await expect(inviteMember(admin, { orgId, email, role: "admin" as never, invitedBy: ownerId })).rejects.toThrow(/can't invite/i);
    const { data } = await admin.from("profiles").select("id").eq("email", email);
    expect(data ?? []).toHaveLength(0); // no auth user was created either
  });

  it("refuses an email that already belongs to an organization, with a clear message", async () => {
    await expect(inviteMember(admin, { orgId, email: ownerEmail, role: "salesperson" })).rejects.toThrow(/already belongs to an organization/i);
  });

  it("records who invited whom, and as what, in the audit log", async () => {
    const { email } = await invite("audited", "salesperson");
    const events = await listAuditEvents(admin, orgId, 50);
    const found = events.find((e) => e.summary === `Invited ${email} as salesperson`);
    expect(found).toBeDefined();
    expect(found?.action).toBe("team.member_invited");
  });
});

describe("changing roles", () => {
  it("promotes a salesperson to manager and then admin, and records each change", async () => {
    const { userId } = await invite("promo", "salesperson");
    await setMemberRole(admin, { orgId, targetUserId: userId, actingUserId: ownerId, role: "manager" });
    expect(await roleOf(userId)).toBe("manager");
    await setMemberRole(admin, { orgId, targetUserId: userId, actingUserId: ownerId, role: "admin" });
    expect(await roleOf(userId)).toBe("admin");

    const summaries = (await listAuditEvents(admin, orgId, 100))
      .filter((e) => e.entity_id === userId && e.action === "team.role_changed")
      .map((e) => e.summary as string);
    expect(summaries).toHaveLength(2);
    expect(summaries.some((s) => s.includes("from salesperson to manager"))).toBe(true);
    expect(summaries.some((s) => s.includes("from manager to admin"))).toBe(true);
  });

  it("rejects a no-op change", async () => {
    const { userId } = await invite("noop", "manager");
    await expect(setMemberRole(admin, { orgId, targetUserId: userId, actingUserId: ownerId, role: "manager" })).rejects.toThrow(/already have that role/i);
  });

  it("keeps the org from ever losing its last admin — by demotion or by deactivation", async () => {
    // Right now the owner is the only admin (any promoted admin above is demoted first).
    const { data: admins } = await admin.from("organization_members").select("user_id").eq("org_id", orgId).eq("role", "admin");
    for (const a of admins ?? []) {
      if (a.user_id !== ownerId) await setMemberRole(admin, { orgId, targetUserId: a.user_id as string, actingUserId: ownerId, role: "salesperson" });
    }

    await expect(setMemberRole(admin, { orgId, targetUserId: ownerId, actingUserId: ownerId, role: "manager" })).rejects.toThrow(/only admin/i);
    await expect(setMemberActive(admin, { orgId, targetUserId: ownerId, actingUserId: ownerId, isActive: false })).rejects.toThrow(/own account/i);
    expect(await roleOf(ownerId)).toBe("admin");
  });

  it("lets an admin be demoted once another admin exists", async () => {
    const { userId } = await invite("second", "manager");
    await setMemberRole(admin, { orgId, targetUserId: userId, actingUserId: ownerId, role: "admin" });
    await setMemberRole(admin, { orgId, targetUserId: ownerId, actingUserId: userId, role: "manager" });
    expect(await roleOf(ownerId)).toBe("manager");
    // Restore for later tests.
    await setMemberRole(admin, { orgId, targetUserId: ownerId, actingUserId: userId, role: "admin" });
    await setMemberRole(admin, { orgId, targetUserId: userId, actingUserId: ownerId, role: "manager" });
  });

  it("will not change the role of someone in another organization", async () => {
    const other = await createOrganizationWithAdmin(admin, { orgName: `Other ${stamp}`, email: `other.${stamp}@team.example`, password: PASSWORD });
    await expect(setMemberRole(admin, { orgId, targetUserId: other.userId, actingUserId: ownerId, role: "manager" })).rejects.toThrow(/not a member/i);
    expect(await roleOf(other.userId)).toBeUndefined();
    await admin.from("organizations").delete().eq("id", other.orgId);
  });

  it("is enforced by the database: a non-admin cannot change roles even by calling the API directly", async () => {
    const { userId, email } = await invite("hacker", "salesperson");
    await admin.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });
    const hacker = await sessionFor(email);

    const self = await hacker.db.from("organization_members").update({ role: "admin" }).eq("user_id", userId).select();
    expect(self.data ?? []).toHaveLength(0); // RLS: only admins may write memberships
    expect(await roleOf(userId)).toBe("salesperson");

    const other = await hacker.db.from("organization_members").update({ role: "salesperson" }).eq("user_id", ownerId).select();
    expect(other.data ?? []).toHaveLength(0);
    expect(await roleOf(ownerId)).toBe("admin");
  });
});

describe("deactivation", () => {
  it("bans sign-in immediately, restores it on reactivation, and audits both", async () => {
    const { userId, email } = await invite("gone", "salesperson");
    await admin.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });

    await setMemberActive(admin, { orgId, targetUserId: userId, actingUserId: ownerId, isActive: false });
    expect((await anonClient().auth.signInWithPassword({ email, password: PASSWORD })).error).not.toBeNull();

    await setMemberActive(admin, { orgId, targetUserId: userId, actingUserId: ownerId, isActive: true });
    expect((await anonClient().auth.signInWithPassword({ email, password: PASSWORD })).error).toBeNull();

    const actions = (await listAuditEvents(admin, orgId, 100)).filter((e) => e.entity_id === userId).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["team.member_deactivated", "team.member_reactivated"]));
  });

  it("is visible only to admins in the audit log", async () => {
    const events = await listAuditEvents(owner.db, orgId, 5);
    expect(events.length).toBeGreaterThan(0);

    const { userId, email } = await invite("viewer", "manager");
    await admin.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });
    const viewer = await sessionFor(email);
    const { data } = await viewer.db.from("audit_events").select("id").eq("org_id", orgId);
    expect(data ?? []).toHaveLength(0);
  });
});
