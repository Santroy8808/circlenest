import type { FeedbackTicketStatus } from "@prisma/client";
import type { AdminCommand, AdminCommandTarget } from "@/modules/admin-moderation/admin-command.contract";

export type AdminActionCard = {
  key: string;
  title: string;
  description: string;
  risk: "low" | "medium" | "high";
  steps: string[];
  keywords?: string[];
};

export type AdminLogView = {
  id: string;
  label: string;
  detail: string;
  createdAt: string;
};

export type AdminFeatureFlagView = {
  key: string;
  enabled: boolean;
  description: string | null;
};

export type AdminFeedbackTicketView = {
  id: string;
  publicId: string;
  title: string;
  description: string;
  kind: string;
  pageUrl: string | null;
  reporterEmail: string | null;
  reporterName: string;
  severity: string;
  // The current read model can contain legacy values; state-changing commands
  // below are constrained to Prisma's FeedbackTicketStatus enum.
  status: string;
  createdAt: string;
  updatedAt: string;
  lastEvent: string | null;
};

export type AdminPortalView = {
  canAccess: boolean;
  actions: AdminActionCard[];
  featureFlags: AdminFeatureFlagView[];
  openFeedbackTicketCount: number;
  activitySummary: {
    activeUsers15m: number;
    pageViews24h: number;
    actions24h: number;
    topRoutes24h: Array<{ route: string; count: number }>;
  };
  recentAuditLogs: AdminLogView[];
  recentDiagnostics: AdminLogView[];
};

export const announcementAudienceKinds = ["ALL_ACTIVE", "TIER", "ROLE", "USERS"] as const;
export const announcementDeliveryChannels = ["CHAT", "MAIL", "LOGIN_POPUP", "GLOBAL_POST", "PERSONAL_EMAIL"] as const;

export type AnnouncementAudienceKind = (typeof announcementAudienceKinds)[number];
export type AnnouncementDeliveryChannel = (typeof announcementDeliveryChannels)[number];

export type AdminAnnouncementResult = {
  id: string;
  title: string;
  recipientCount: number;
  chatDeliveryCount: number;
  mailDeliveryCount: number;
  popupDeliveryCount: number;
  globalPostDeliveryCount: number;
  personalEmailQueuedCount: number;
  feedPostId: string | null;
  dismissedAt: string | null;
  dismissedByUserId: string | null;
  createdAt: string;
};

export type AdminFeedbackTicketTransitionPayload = {
  fromStatus: FeedbackTicketStatus;
  toStatus: FeedbackTicketStatus;
  note: string;
  assigneeUserId?: string | null;
};

export type AdminFeedbackTicketTransitionCommand = AdminCommand<
  "feedback-ticket.transition",
  AdminFeedbackTicketTransitionPayload,
  AdminCommandTarget<"FeedbackTicket">
>;

export type AdminFeedbackTicketAssignmentPayload = {
  assigneeUserId: string | null;
  note: string;
};

export type AdminFeedbackTicketAssignmentCommand = AdminCommand<
  "feedback-ticket.assign",
  AdminFeedbackTicketAssignmentPayload,
  AdminCommandTarget<"FeedbackTicket">
>;

export type AdminFeedbackTicketNoteCommand = AdminCommand<
  "feedback-ticket.note",
  { note: string },
  AdminCommandTarget<"FeedbackTicket">
>;
