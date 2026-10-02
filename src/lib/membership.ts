export type MembershipAction = "approve" | "reject" | "revoke";

export type MembershipTransition =
  | { membership: "active"; request: "APPROVED" }
  | { membership: "unchanged"; request: "REJECTED" }
  | { membership: "revoked"; request: "unchanged" };

export function getMembershipTransition(action: MembershipAction): MembershipTransition {
  if (action === "approve") return { membership: "active", request: "APPROVED" };
  if (action === "reject") return { membership: "unchanged", request: "REJECTED" };
  return { membership: "revoked", request: "unchanged" };
}

export function assertCanTargetMember(ownerId: string, targetUserId: string): void {
  if (ownerId === targetUserId) throw new Error("OWNER_IMMUTABLE");
}
