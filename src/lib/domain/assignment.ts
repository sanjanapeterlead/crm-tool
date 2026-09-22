/**
 * The seam where automatic routing plugs in later. V1 ships only manual
 * assignment; round-robin / load-based routing is V2 and must be added as a
 * new implementation of this interface, not as branches in `captureLead`.
 */

export interface AssignmentContext {
  orgId: string;
  /** Where the lead came from (`meta`, `manual`, `mock`…), so strategies can route by source. */
  source: string;
  /** An assignee chosen explicitly by a person or by an integration's default-assignee setting. */
  requestedAssigneeId: string | null;
}

export interface AssignmentStrategy {
  readonly name: string;
  /** The user id to assign to, or null to leave the lead unassigned. */
  pickAssignee(context: AssignmentContext): Promise<string | null>;
}

/** V1 behaviour: honour whoever was explicitly chosen, otherwise leave unassigned. */
export const manualAssignment: AssignmentStrategy = {
  name: "manual",
  async pickAssignee(context) {
    return context.requestedAssigneeId;
  },
};
