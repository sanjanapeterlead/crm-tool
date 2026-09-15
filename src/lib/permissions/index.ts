import type { OrgRole } from "@/lib/types/domain";

/**
 * Central place for role → capability rules. Server code (services, route
 * handlers) must call these — never infer permissions from hidden UI alone.
 * Client components may also use these to decide what to render, but that is
 * a UX convenience, not the authorization boundary.
 */
export const permissions = {
  canViewAllLeads: (role: OrgRole) => role === "admin" || role === "manager",
  canManageTeam: (role: OrgRole) => role === "admin",
  canEditSettings: (role: OrgRole) => role === "admin",
  canDeleteLead: (role: OrgRole) => role === "admin" || role === "manager",
  canManageLeadStatuses: (role: OrgRole) => role === "admin",
};

/** Whether a user may access a specific lead given its assignment. */
export function canAccessLead(
  role: OrgRole,
  userId: string,
  lead: { assigned_to: string | null; created_by: string | null }
) {
  if (permissions.canViewAllLeads(role)) return true;
  return lead.assigned_to === userId || lead.created_by === userId;
}
