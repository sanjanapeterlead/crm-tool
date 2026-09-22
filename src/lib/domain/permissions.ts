/**
 * Role → capability rules. The application-layer half of authorization;
 * Row Level Security in Postgres is the hard boundary underneath it. If the
 * two ever disagree, RLS wins and this file is fixed.
 *
 * Services call these — never infer permission from a hidden button.
 * `admin` is the brief's OWNER/ADMIN (DECISIONS D-003).
 */

export type OrgRole = "admin" | "manager" | "salesperson";

export const ORG_ROLES: readonly OrgRole[] = ["admin", "manager", "salesperson"];

const isAdmin = (role: OrgRole) => role === "admin";
const isManagerOrAdmin = (role: OrgRole) => role === "admin" || role === "manager";

export const permissions = {
  /** Sees every lead, task and dashboard number in the org (not just their own). */
  canViewAllLeads: isManagerOrAdmin,
  canViewOwnerDashboard: isManagerOrAdmin,
  canDeleteLead: isManagerOrAdmin,

  canManageTeam: isAdmin,
  canChangeRoles: isAdmin,
  canEditSettings: isAdmin,
  canManageLeadStatuses: isAdmin,
  canConnectIntegrations: isAdmin,

  /**
   * Assigning or reassigning is a manager/admin act (DECISIONS D-012).
   * A salesperson may only *claim* a lead nobody owns yet, for themselves.
   */
  canAssignLead(
    role: OrgRole,
    actorId: string,
    lead: { assigned_to: string | null },
    targetAssigneeId: string
  ): boolean {
    if (isManagerOrAdmin(role)) return true;
    return lead.assigned_to === null && targetAssigneeId === actorId;
  },

  /**
   * Choosing an owner when *creating* a lead: managers/admins pick anyone; a
   * salesperson may leave it unassigned or take it for themselves.
   */
  canAssignNewLead(role: OrgRole, actorId: string, targetAssigneeId: string | null): boolean {
    if (isManagerOrAdmin(role)) return true;
    return targetAssigneeId === null || targetAssigneeId === actorId;
  },
};

/**
 * Whether a user may access a specific lead. Mirrors `can_access_lead()` in the
 * database: managers/admins see everything; a salesperson sees their own leads,
 * ones they created, and the unassigned pool they can claim from.
 */
export function canAccessLead(
  role: OrgRole,
  userId: string,
  lead: { assigned_to: string | null; created_by: string | null }
): boolean {
  if (permissions.canViewAllLeads(role)) return true;
  return lead.assigned_to === null || lead.assigned_to === userId || lead.created_by === userId;
}
