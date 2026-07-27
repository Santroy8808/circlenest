import { FeedbackTicketMessageType, type UserRole } from "@prisma/client";
import { isAdminRole } from "@/lib/platform/roles";

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
