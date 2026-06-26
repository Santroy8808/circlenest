import { FeedbackTicketStatus, Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { isAdminRole } from "@/lib/platform/roles";
import type { AdminActionCard, AdminFeedbackTicketView, AdminLogView, AdminPortalView } from "@/modules/admin-moderation/types";
import { getPlatformActivitySummary } from "@/modules/platform-activity/platform-activity.service";

const MODULE_KEY = "admin-moderation";

export const adminActionCards: AdminActionCard[] = [
  {
    key: "tier-policy",
    title: "Global Tier Permissions",
    description: "God-only editor for global tier capability assignments. Changes affect every account on that membership tier.",
    risk: "high",
    keywords: ["god", "tier", "membership", "global permissions", "policy matrix", "free", "auditor", "admin"],
    steps: [
      "Review the current tier capability grid.",
      "Click a Yes or No cell for the exact tier and privilege.",
      "Confirm the global impact and enter the God account password.",
      "Save the override and write a critical audit log."
    ]
  },
  {
    key: "feature-flags",
    title: "Feature Flags",
    description: "Turn risky or unfinished modules on/off without redeploying.",
    risk: "medium",
    keywords: ["toggle feature", "enable module", "disable module", "configuration", "flags"],
    steps: ["Choose feature key.", "Set enabled state.", "Describe reason.", "Save flag and write audit log."]
  },
  {
    key: "platform-pricing",
    title: "Platform Pricing",
    description: "Manage global credit costs for listings, boosts, mail ads, and paid placement packages without creating campaigns for users.",
    risk: "high",
    keywords: ["ad spend", "ads", "cost", "pricing", "boost", "listing cost", "mail ads", "credits price"],
    steps: [
      "Review the current global pricing table.",
      "Choose one existing price rule/package.",
      "Adjust credits, duration, active state, or display text.",
      "Save the change and write audit log."
    ]
  },
  {
    key: "ad-schedule",
    title: "Global Ad Schedule",
    description: "Force a recalculation of ad display-time schedules for the rest of the current platform day without skipping the next midnight calculation.",
    risk: "high",
    keywords: ["ads", "ad schedule", "auction", "display time", "placements", "recalculate", "rotation"],
    steps: [
      "Review the latest schedule run for each placement.",
      "Force a rest-of-day recalculation when campaign demand or admin policy changes.",
      "Clear only future slots for today.",
      "Rebuild placement schedules and write audit logs."
    ]
  },
  {
    key: "stripe-setup",
    title: "Stripe Setup",
    description: "Configure Stripe connection status, membership price IDs, credit packages, and checkout enablement.",
    risk: "high",
    keywords: ["stripe", "billing", "checkout", "subscription", "price id", "webhook", "credit package", "payment"],
    steps: [
      "Review Stripe secret and webhook readiness without exposing raw secrets.",
      "Enter or update connection keys and checkout enablement.",
      "Attach Stripe recurring price IDs to membership tiers.",
      "Attach Stripe one-time price IDs to ad-credit packages."
    ]
  },
  {
    key: "platform-credits",
    title: "Platform Credits",
    description: "Grant or remove platform-only credits for a member with a required reason, ledger entry, and audit trail.",
    risk: "high",
    keywords: ["ad spend", "ads", "credits", "grant credits", "remove credits", "member balance"],
    steps: [
      "Search for the member by email or username.",
      "Review the current platform-credit balance.",
      "Enter a positive grant or negative removal amount.",
      "Confirm the reason, update the ledger, and write audit log."
    ]
  },
  {
    key: "status-change",
    title: "Status Change",
    description: "Change an account's permanent membership tier without changing admin role or real-money balances.",
    risk: "high",
    keywords: ["membership", "tier", "status", "change tier", "free", "contributor", "professional", "auditor", "account status"],
    steps: [
      "Search for the account by email or username.",
      "Review the current membership tier and account role.",
      "Choose Free, Contributor, Professional, or Auditor.",
      "Confirm the audit reason, update membership status, and write audit log."
    ]
  },
  {
    key: "launch-access",
    title: "Launch Access",
    description: "Manage founder pricing, ad-experience guardrails, and temporary Free-to-Contributor/Professional promotional access.",
    risk: "high",
    keywords: ["new user", "invite", "invite code", "free account", "founder pricing", "promotional access", "launch", "temporary tier"],
    steps: [
      "Review founder pricing and anti-spam guardrails.",
      "Choose global or individual launch access.",
      "Pick Contributor or Professional and choose the exact duration.",
      "Save the grant and audit the promotional access window."
    ]
  },
  {
    key: "account-support",
    title: "Account Support",
    description: "Create preverified accounts without SMTP and reset account passwords with session revocation.",
    risk: "high",
    keywords: ["create user", "new user", "password reset", "reset password", "account support", "smtp", "preverified"],
    steps: [
      "Choose Create User or Reset Password.",
      "Enter the account fields or target account identifier.",
      "Confirm a required audit reason.",
      "Create the account or reset the password and write audit logs."
    ]
  },
  {
    key: "reports-queue",
    title: "Reports Queue",
    description: "Review shared feedback, bug reports, abuse reports, content reports, and support tickets.",
    risk: "medium",
    keywords: ["tickets", "support", "feedback", "bugs", "abuse", "reports", "issue queue"],
    steps: ["Open the shared admin queue.", "Review the exact issue and source page.", "Move the ticket into review or resolve it.", "Leave admin notes when deeper action is needed."]
  },
  {
    key: "announcements",
    title: "Public Announcements",
    description: "Send global, tier-specific, or targeted platform notices.",
    risk: "high",
    keywords: ["announcement", "notice", "broadcast", "global message", "popup", "personal email", "mail everyone"],
    steps: [
      "Choose global, tier, role, or specific-user audience.",
      "Choose delivery channels: chat, mail, login pop-up, persistent pinned stream announcement, or queued personal email.",
      "Draft the announcement title/body and internal reason.",
      "Review delivery counts, publish, and audit."
    ]
  }
];

export async function isAdminUser(userId?: string) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  return isAdminRole(user?.role);
}

function toAuditLogView(log: {
  id: string;
  module: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: Date;
}): AdminLogView {
  return {
    id: log.id,
    label: `${log.module} · ${log.action}`,
    detail: [log.targetType, log.targetId].filter(Boolean).join(" ") || "No target",
    createdAt: log.createdAt.toISOString()
  };
}

function toDiagnosticLogView(log: { id: string; level: string; module: string; message: string; createdAt: Date }): AdminLogView {
  return {
    id: log.id,
    label: `${log.level.toUpperCase()} · ${log.module}`,
    detail: log.message,
    createdAt: log.createdAt.toISOString()
  };
}

function reporterName(ticket: {
  reporterEmail: string | null;
  reporter: {
    email: string;
    username: string;
    profile: {
      displayName: string | null;
    } | null;
  } | null;
}) {
  return ticket.reporter?.profile?.displayName ?? ticket.reporter?.username ?? ticket.reporterEmail ?? "Anonymous reporter";
}

function toFeedbackTicketView(ticket: {
  id: string;
  publicId: string;
  title: string;
  description: string;
  pageUrl: string | null;
  reporterEmail: string | null;
  severity: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  reporter: {
    email: string;
    username: string;
    profile: {
      displayName: string | null;
    } | null;
  } | null;
  events: Array<{
    action: string;
    createdAt: Date;
  }>;
}): AdminFeedbackTicketView {
  const lastEvent = ticket.events[0];

  return {
    id: ticket.id,
    publicId: ticket.publicId,
    title: ticket.title,
    description: ticket.description,
    pageUrl: ticket.pageUrl,
    reporterEmail: ticket.reporterEmail ?? ticket.reporter?.email ?? null,
    reporterName: reporterName(ticket),
    severity: ticket.severity,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    lastEvent: lastEvent ? `${lastEvent.action} · ${lastEvent.createdAt.toLocaleString()}` : null
  };
}

export async function getAdminPortalView(userId?: string): Promise<AdminPortalView> {
  if (!(await isAdminUser(userId))) {
    return {
      canAccess: false,
      actions: [],
      featureFlags: [],
      openFeedbackTicketCount: 0,
      activitySummary: {
        activeUsers15m: 0,
        pageViews24h: 0,
        actions24h: 0,
        topRoutes24h: []
      },
      recentAuditLogs: [],
      recentDiagnostics: []
    };
  }

  const [featureFlags, openFeedbackTicketCount, auditLogs, diagnosticsLogs, activitySummary] = await Promise.all([
    prisma.featureFlag.findMany({
      orderBy: { key: "asc" },
      take: 80
    }),
    prisma.feedbackTicket.count({
      where: {
        status: {
          in: [FeedbackTicketStatus.OPEN, FeedbackTicketStatus.IN_REVIEW]
        }
      }
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.diagnosticLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    getPlatformActivitySummary()
  ]);

  return {
    canAccess: true,
    actions: adminActionCards,
    featureFlags: featureFlags.map((flag) => ({
      key: flag.key,
      enabled: flag.enabled,
      description: flag.description
    })),
    openFeedbackTicketCount,
    activitySummary,
    recentAuditLogs: auditLogs.map(toAuditLogView),
    recentDiagnostics: diagnosticsLogs.map(toDiagnosticLogView)
  };
}

export function getAdminActionCard(actionKey: string) {
  return adminActionCards.find((action) => action.key === actionKey) ?? null;
}

export async function getAdminFeedbackTicketQueue(userId?: string): Promise<{ canAccess: boolean; tickets: AdminFeedbackTicketView[] }> {
  if (!(await isAdminUser(userId))) {
    return {
      canAccess: false,
      tickets: []
    };
  }

  const tickets = await prisma.feedbackTicket.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      reporter: {
        select: {
          email: true,
          username: true,
          profile: {
            select: {
              displayName: true
            }
          }
        }
      },
      events: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          action: true,
          createdAt: true
        }
      }
    }
  });

  return {
    canAccess: true,
    tickets: tickets.map(toFeedbackTicketView)
  };
}

export async function setFeatureFlag(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const body = input as { key?: unknown; enabled?: unknown; description?: unknown };
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const enabled = Boolean(body.enabled);
  const description = typeof body.description === "string" ? body.description.trim() : "";

  if (!/^[a-z0-9._:-]{2,80}$/i.test(key)) {
    return { ok: false as const, error: "Feature key must be 2-80 letters, numbers, dots, dashes, colons, or underscores." };
  }

  const flag = await prisma.featureFlag.upsert({
    where: { key },
    update: {
      enabled,
      description: description || null
    },
    create: {
      key,
      enabled,
      description: description || null
    }
  });

  await prisma.adminAction.create({
    data: {
      actorUserId,
      actionKey: "feature-flags",
      module: MODULE_KEY,
      status: "completed",
      metadata: {
        key,
        enabled
      } as Prisma.InputJsonObject
    }
  });
  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "feature-flag.set",
    targetType: "FeatureFlag",
    targetId: flag.id,
    severity: "warning",
    metadata: { key, enabled }
  });
  await diagnostics.info(MODULE_KEY, "Feature flag updated.", { actorUserId, key, enabled });

  return { ok: true as const, flag };
}
