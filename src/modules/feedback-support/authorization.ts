import { FeedbackTicketMessageType, type UserRole } from "@prisma/client";
import { isAdminRole } from "@/lib/platform/roles";

export type FeedbackTicketAudience = "creator" | "admin";

export function canCreateFeedbackTicket(viewerUserId?: string | null): viewerUserId is string {
  return Boolean(viewerUserId);
}

export function resolveFeedbackTicketAudience(
  viewerRole: UserRole,
  requestedAudience: FeedbackTicketAudience = "creator"
): FeedbackTicketAudience | null {
  if (requestedAudience === "admin") {
    return isAdminRole(viewerRole) ? "admin" : null;
  }
  return "creator";
}

export function canViewFeedbackTicket(input: {
  viewerUserId: string;
  viewerRole: UserRole;
  reporterUserId: string | null;
}) {
  return isAdminRole(input.viewerRole) || input.reporterUserId === input.viewerUserId;
}

export function canAddFeedbackMessage(input: {
  viewerUserId: string;
  viewerRole: UserRole;
  reporterUserId: string | null;
  messageType: FeedbackTicketMessageType;
}) {
  if (isAdminRole(input.viewerRole)) return true;
  return (
    input.reporterUserId === input.viewerUserId &&
    input.messageType === FeedbackTicketMessageType.NORMAL
  );
}

export function visibleFeedbackMessageTypes(viewerRole: UserRole) {
  return isAdminRole(viewerRole)
    ? [FeedbackTicketMessageType.NORMAL, FeedbackTicketMessageType.INTERNAL]
    : [FeedbackTicketMessageType.NORMAL];
}

export function canAccessFeedbackScreenshot(input: {
  viewerUserId: string;
  viewerRole: UserRole;
  reporterUserId: string | null;
}) {
  return (
    input.reporterUserId === input.viewerUserId ||
    isAdminRole(input.viewerRole)
  );
}
