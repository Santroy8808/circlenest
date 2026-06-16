export type AdminActionCategory =
  | "Account Support"
  | "Access Control"
  | "Moderation"
  | "Platform"
  | "Business"
  | "Money Safety"
  | "Records";

export type AdminActionId =
  | "account-security"
  | "member-tier"
  | "admin-role"
  | "site-moderators"
  | "membership-invitations"
  | "content-reports"
  | "feature-flags"
  | "categories"
  | "announcements"
  | "business-verification"
  | "abuse-throttle"
  | "support-note"
  | "webhook-replay"
  | "data-request"
  | "security-events"
  | "audit-log"
  | "processor-config";

export type AdminActionCard = {
  id: AdminActionId;
  title: string;
  category: AdminActionCategory;
  summary: string;
  outcome: string;
  risk: "Low" | "Medium" | "High";
  time: string;
};

export const ADMIN_ACTIONS: AdminActionCard[] = [
  {
    id: "account-security",
    title: "Account and Security Support",
    category: "Account Support",
    summary: "Force log-out, resend verification, reset 2FA, suspend, restore, or require terms acceptance.",
    outcome: "The user account is updated and the action is audit logged.",
    risk: "High",
    time: "2-3 min",
  },
  {
    id: "member-tier",
    title: "Change Member Tier",
    category: "Access Control",
    summary: "Move a member between Free, Contributor, Biz, or Auditor without changing admin role.",
    outcome: "The member tier changes immediately and is recorded in the audit log.",
    risk: "Medium",
    time: "1 min",
  },
  {
    id: "admin-role",
    title: "Grant Admin Role",
    category: "Access Control",
    summary: "Global admins can assign administrator role and set the separate admin password.",
    outcome: "The target account receives admin role, but admin powers still require Administrator Mode.",
    risk: "High",
    time: "2 min",
  },
  {
    id: "site-moderators",
    title: "Manage Site Moderators",
    category: "Access Control",
    summary: "Invite, grant, or revoke site-wide moderators.",
    outcome: "Moderator status changes through the existing protected workflow.",
    risk: "Medium",
    time: "2 min",
  },
  {
    id: "membership-invitations",
    title: "Membership Invitations",
    category: "Access Control",
    summary: "Create, approve, reject, revoke, expire, or resubmit invite-only membership applications.",
    outcome: "The invitation state changes and qualification decisions remain audit visible.",
    risk: "Medium",
    time: "3-5 min",
  },
  {
    id: "content-reports",
    title: "Review Content Reports",
    category: "Moderation",
    summary: "Assign, resolve, dismiss, or remove reported content while preserving the report trail.",
    outcome: "The report status updates and the moderation action is audit logged.",
    risk: "Medium",
    time: "3-5 min",
  },
  {
    id: "feature-flags",
    title: "Feature Flag Control",
    category: "Platform",
    summary: "Turn unfinished or risky modules on or off without a redeploy.",
    outcome: "The feature flag is saved with admin attribution.",
    risk: "Medium",
    time: "1 min",
  },
  {
    id: "categories",
    title: "Category Management",
    category: "Platform",
    summary: "Manage Market, jobs, events, and fundraiser categories.",
    outcome: "A static searchable category is created or updated.",
    risk: "Low",
    time: "1 min",
  },
  {
    id: "announcements",
    title: "Public Announcement",
    category: "Platform",
    summary: "Create global, tier-specific, or targeted platform notices.",
    outcome: "The announcement is saved as a draft or published to notifications.",
    risk: "Medium",
    time: "3 min",
  },
  {
    id: "business-verification",
    title: "Business Verification",
    category: "Business",
    summary: "Approve, reject, request changes, or place a business profile on hold.",
    outcome: "Business visibility and storefront eligibility are updated.",
    risk: "High",
    time: "3-5 min",
  },
  {
    id: "abuse-throttle",
    title: "Apply Abuse Throttle",
    category: "Moderation",
    summary: "Throttle spammy users or businesses without fully suspending them.",
    outcome: "A platform throttle record is created for safety review.",
    risk: "Medium",
    time: "2 min",
  },
  {
    id: "support-note",
    title: "Add Support Note",
    category: "Records",
    summary: "Attach internal notes to users, businesses, campaigns, withdrawals, or reports.",
    outcome: "The note is stored internally and audit logged.",
    risk: "Low",
    time: "1 min",
  },
  {
    id: "webhook-replay",
    title: "Queue Webhook Replay",
    category: "Money Safety",
    summary: "Queue a safe retry request for failed payment or processor webhook events.",
    outcome: "A replay request is queued without exposing or editing payment secrets.",
    risk: "High",
    time: "2 min",
  },
  {
    id: "data-request",
    title: "Data Export / Deletion Request",
    category: "Records",
    summary: "Track privacy export, deletion, or correction requests without hard-deleting ledgers.",
    outcome: "The request is recorded for follow-up and compliance tracking.",
    risk: "Medium",
    time: "2 min",
  },
  {
    id: "security-events",
    title: "Login and Security Events",
    category: "Account Support",
    summary: "Review failed logins, resets, session revocations, and suspicious account activity.",
    outcome: "Admin can inspect recent events before choosing a separate action.",
    risk: "Low",
    time: "Review",
  },
  {
    id: "audit-log",
    title: "Audit Log Viewer",
    category: "Records",
    summary: "Inspect preserved admin and moderator actions.",
    outcome: "Admin sees who did what, when, and why.",
    risk: "Low",
    time: "Review",
  },
  {
    id: "processor-config",
    title: "Payment Processor Configuration",
    category: "Money Safety",
    summary: "Review Stripe-ready processor metadata, fees, flow availability, and webhook health.",
    outcome: "Admin is sent to the dedicated processor console. Secrets remain hidden.",
    risk: "High",
    time: "Advanced",
  },
];

export function getAdminAction(id: string) {
  return ADMIN_ACTIONS.find((action) => action.id === id) ?? null;
}

export function adminActionCategories() {
  return Array.from(new Set(ADMIN_ACTIONS.map((action) => action.category)));
}
