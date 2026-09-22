import { describe, expect, it } from "vitest";
import { checkDeactivation, checkRoleChange, INVITABLE_ROLES } from "@/lib/domain/team";

describe("invitable roles", () => {
  it("never includes admin — admins are made by promotion, not by invitation", () => {
    expect([...INVITABLE_ROLES]).toEqual(["manager", "salesperson"]);
  });
});

describe("checkRoleChange", () => {
  it("allows promoting a salesperson to manager or admin", () => {
    expect(checkRoleChange({ currentRole: "salesperson", newRole: "manager", activeAdminCount: 1 }).ok).toBe(true);
    expect(checkRoleChange({ currentRole: "salesperson", newRole: "admin", activeAdminCount: 1 }).ok).toBe(true);
  });

  it("rejects a no-op", () => {
    expect(checkRoleChange({ currentRole: "manager", newRole: "manager", activeAdminCount: 2 })).toEqual({
      ok: false,
      error: "They already have that role.",
    });
  });

  it("refuses to demote the only admin, so the org can't be locked out of its own settings", () => {
    const result = checkRoleChange({ currentRole: "admin", newRole: "salesperson", activeAdminCount: 1 });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toMatch(/only admin/i);
  });

  it("allows demoting an admin when another one remains", () => {
    expect(checkRoleChange({ currentRole: "admin", newRole: "manager", activeAdminCount: 2 }).ok).toBe(true);
  });
});

describe("checkDeactivation", () => {
  const base = { actorId: "admin-1", targetId: "rep-1", targetRole: "salesperson" as const, activeAdminCount: 1 };

  it("allows deactivating someone else", () => {
    expect(checkDeactivation(base).ok).toBe(true);
  });

  it("never lets anyone deactivate themselves", () => {
    expect(checkDeactivation({ ...base, targetId: "admin-1", targetRole: "admin", activeAdminCount: 2 }).ok).toBe(false);
  });

  it("protects the last active admin", () => {
    expect(checkDeactivation({ ...base, targetId: "admin-2", targetRole: "admin", activeAdminCount: 1 }).ok).toBe(false);
    expect(checkDeactivation({ ...base, targetId: "admin-2", targetRole: "admin", activeAdminCount: 2 }).ok).toBe(true);
  });
});
