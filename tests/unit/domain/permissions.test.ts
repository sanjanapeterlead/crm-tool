import { describe, expect, it } from "vitest";
import { canAccessLead, ORG_ROLES, permissions, type OrgRole } from "@/lib/domain/permissions";

type RoleCapability =
  | "canViewAllLeads"
  | "canViewOwnerDashboard"
  | "canDeleteLead"
  | "canManageTeam"
  | "canChangeRoles"
  | "canEditSettings"
  | "canManageLeadStatuses"
  | "canConnectIntegrations";

const matrix: Array<[RoleCapability, Record<OrgRole, boolean>]> = [
  ["canViewAllLeads", { admin: true, manager: true, salesperson: false }],
  ["canViewOwnerDashboard", { admin: true, manager: true, salesperson: false }],
  ["canDeleteLead", { admin: true, manager: true, salesperson: false }],
  ["canManageTeam", { admin: true, manager: false, salesperson: false }],
  ["canChangeRoles", { admin: true, manager: false, salesperson: false }],
  ["canEditSettings", { admin: true, manager: false, salesperson: false }],
  ["canManageLeadStatuses", { admin: true, manager: false, salesperson: false }],
  ["canConnectIntegrations", { admin: true, manager: false, salesperson: false }],
];

describe("role capability matrix", () => {
  for (const [capability, expected] of matrix) {
    for (const role of ORG_ROLES) {
      it(`${role} ${expected[role] ? "can" : "cannot"} ${capability}`, () => {
        expect(permissions[capability](role)).toBe(expected[role]);
      });
    }
  }
});

describe("canAssignLead (DECISIONS D-012)", () => {
  const unassigned = { assigned_to: null };
  const owned = { assigned_to: "rep-a" };

  it("lets admins and managers assign or reassign anyone", () => {
    for (const role of ["admin", "manager"] as const) {
      expect(permissions.canAssignLead(role, "boss", owned, "rep-b")).toBe(true);
      expect(permissions.canAssignLead(role, "boss", unassigned, "rep-b")).toBe(true);
    }
  });

  it("lets a salesperson claim an unassigned lead for themselves", () => {
    expect(permissions.canAssignLead("salesperson", "rep-a", unassigned, "rep-a")).toBe(true);
  });

  it("stops a salesperson assigning an unassigned lead to someone else", () => {
    expect(permissions.canAssignLead("salesperson", "rep-a", unassigned, "rep-b")).toBe(false);
  });

  it("stops a salesperson taking or passing on a lead someone already owns", () => {
    expect(permissions.canAssignLead("salesperson", "rep-b", owned, "rep-b")).toBe(false);
    expect(permissions.canAssignLead("salesperson", "rep-a", owned, "rep-b")).toBe(false);
  });
});

describe("canAssignNewLead", () => {
  it("lets managers and admins create a lead for anyone", () => {
    expect(permissions.canAssignNewLead("manager", "boss", "rep-a")).toBe(true);
    expect(permissions.canAssignNewLead("admin", "boss", null)).toBe(true);
  });

  it("lets a salesperson create an unassigned lead or one for themselves only", () => {
    expect(permissions.canAssignNewLead("salesperson", "rep-a", null)).toBe(true);
    expect(permissions.canAssignNewLead("salesperson", "rep-a", "rep-a")).toBe(true);
    expect(permissions.canAssignNewLead("salesperson", "rep-a", "rep-b")).toBe(false);
  });
});

describe("canAccessLead", () => {
  it("gives admins and managers every lead", () => {
    const lead = { assigned_to: "x", created_by: "y" };
    expect(canAccessLead("admin", "me", lead)).toBe(true);
    expect(canAccessLead("manager", "me", lead)).toBe(true);
  });

  it("limits a salesperson to their own leads, ones they created, and the unassigned pool", () => {
    expect(canAccessLead("salesperson", "me", { assigned_to: "me", created_by: null })).toBe(true);
    expect(canAccessLead("salesperson", "me", { assigned_to: "other", created_by: "me" })).toBe(true);
    expect(canAccessLead("salesperson", "me", { assigned_to: null, created_by: null })).toBe(true);
  });

  it("hides a colleague's lead from a salesperson", () => {
    expect(canAccessLead("salesperson", "me", { assigned_to: "other", created_by: "other" })).toBe(false);
    expect(canAccessLead("salesperson", "me", { assigned_to: "other", created_by: null })).toBe(false);
  });
});
