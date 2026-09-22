import type { OrgRole } from "./permissions";

/**
 * Roles an invitation can grant. `admin` is never granted by invite: the
 * founder is the first admin and others are made admins by promotion, a
 * deliberate second step rather than a side effect of typing an email.
 */
export const INVITABLE_ROLES = ["manager", "salesperson"] as const satisfies readonly OrgRole[];
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export type RoleChangeCheck = { ok: true } | { ok: false; error: string };

/**
 * Whether an admin may change `target`'s role. The invariant that matters: an
 * organization must always keep at least one active admin, or nobody can manage
 * the team, the integrations or the settings again without database access.
 */
export function checkRoleChange(input: {
  currentRole: OrgRole;
  newRole: OrgRole;
  /** Active admins in the org right now, including the target if they are one. */
  activeAdminCount: number;
}): RoleChangeCheck {
  if (input.currentRole === input.newRole) return { ok: false, error: "They already have that role." };

  if (input.currentRole === "admin" && input.activeAdminCount <= 1) {
    return { ok: false, error: "This is the only admin. Make someone else an admin first." };
  }
  return { ok: true };
}

/** Whether an admin may deactivate `target`. Same invariant, plus "not yourself". */
export function checkDeactivation(input: {
  actorId: string;
  targetId: string;
  targetRole: OrgRole;
  activeAdminCount: number;
}): RoleChangeCheck {
  if (input.actorId === input.targetId) return { ok: false, error: "You can't deactivate your own account." };
  if (input.targetRole === "admin" && input.activeAdminCount <= 1) {
    return { ok: false, error: "Can't deactivate the only remaining admin." };
  }
  return { ok: true };
}
