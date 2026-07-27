import { FeedbackTicketMessageType, type UserRole } from "@prisma/client";
import { isAdminRole } from "@/lib/platform/roles";

export function canCreateFeedbackTicket(viewerUserId?: string | null): viewerUserId is string {
  return Boolean(viewerUserId);
}

export function visibleFeedbackMessageTypes(viewerRole: UserRole) {
  return isAdminRole(viewerRole)
    ? [FeedbackTicketMessageType.NORMAL, FeedbackTicketMessageType.INTERNAL]
    : [];
}

export function canAccessFeedbackScreenshot(viewerRole: UserRole) {
  return isAdminRole(viewerRole);
}
