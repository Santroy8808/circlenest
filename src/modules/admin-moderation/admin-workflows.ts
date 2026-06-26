export type AdminFunctionEntry = {
  href: string;
  title: string;
  category: string;
  description: string;
  badge: string;
  keywords: string[];
};

export type AdminWorkflowGroup = {
  key: string;
  title: string;
  description: string;
  entries: AdminFunctionEntry[];
};

export type AdminWorkflowCategory = {
  key: string;
  href: string;
  title: string;
  eyebrow: string;
  description: string;
  badge: string;
  keywords: string[];
  groups: AdminWorkflowGroup[];
};

export function buildWorkflowCategories(openFeedbackTicketCount: number): AdminWorkflowCategory[] {
  return [
    {
      key: "account-management",
      href: "/admin/workflows/account-management",
      title: "Account Management",
      eyebrow: "Users",
      description: "Start with account lookup, invite/create flows, then move into account-specific support, membership, ad-credit, and report actions.",
      badge: "7 tools",
      keywords: ["user", "account", "invite", "create user", "reset password", "membership", "credits", "reports"],
      groups: [
        {
          key: "start-account-work",
          title: "Start Account Work",
          description: "Use these first when an admin needs to invite, create, or locate a member account.",
          entries: [
            {
              href: "/admin/actions/status-change",
              title: "Search Account",
              category: "Account Management",
              description: "Find an account by email or username before performing account-scoped admin work.",
              badge: "search",
              keywords: ["search account", "find account", "lookup user", "email", "username"]
            },
            {
              href: "/admin/actions/launch-access?tool=invite",
              title: "Create Invite",
              category: "Account Management",
              description: "Generate a one-time free account invite code, email it, or attach it to a future account.",
              badge: "invite",
              keywords: ["new user", "invite", "invite code", "free account", "signup", "registration", "email invite"]
            },
            {
              href: "/admin/actions/account-support?tool=create-user",
              title: "Create Account",
              category: "Account Management",
              description: "Create a preverified user account directly when the admin is effectively inviting the person.",
              badge: "create",
              keywords: ["new user", "create user", "account creation", "preverified", "without smtp", "manual account"]
            }
          ]
        },
        {
          key: "after-account-lookup",
          title: "After Account Lookup",
          description: "Use these after the target account is known. Each tool performs its own account search and writes audit logs.",
          entries: [
            {
              href: "/admin/actions/status-change",
              title: "Membership Management",
              category: "Account Management",
              description: "Change an account's permanent membership tier without changing role or real-money balances.",
              badge: "tier",
              keywords: ["membership", "tier", "status change", "free", "contributor", "professional", "auditor"]
            },
            {
              href: "/admin/actions/platform-credits",
              title: "Ad Credit Management",
              category: "Account Management",
              description: "Grant or remove platform-only ad credits with a ledger entry and audit trail.",
              badge: "credits",
              keywords: ["ad spend", "ads", "credits", "grant credits", "remove credits", "member balance"]
            },
            {
              href: "/admin/actions/account-support?tool=reset-password",
              title: "Account Support",
              category: "Account Management",
              description: "Reset account passwords and revoke active sessions.",
              badge: "password",
              keywords: ["reset password", "password reset", "account support", "session revoke", "security"]
            },
            {
              href: "/admin/actions/reports-queue",
              title: "Account Reports",
              category: "Account Management",
              description: "Review reports connected to accounts, reporters, abuse, bugs, content, and support tickets.",
              badge: openFeedbackTicketCount > 0 ? `${openFeedbackTicketCount} open` : "queue",
              keywords: ["report issue", "tickets", "support", "bug", "abuse", "feedback", "content report", "account reports"]
            }
          ]
        }
      ]
    },
    {
      key: "membership-launch",
      href: "/admin/workflows/membership-launch",
      title: "Membership And Launch",
      eyebrow: "Access",
      description: "Global membership configuration, launch grants, founder pricing, and temporary access programs.",
      badge: "5 tools",
      keywords: ["membership", "launch", "founder", "pricing", "promo", "promotion", "temporary access", "god", "tier permissions"],
      groups: [
        {
          key: "launch-programs",
          title: "Launch Programs",
          description: "Control temporary access and launch-era pricing references.",
          entries: [
            {
              href: "/admin/actions/launch-access?tool=promo",
              title: "Promotional Grant",
              category: "Membership And Launch",
              description: "Temporarily upgrade Free users to Contributor or Professional access.",
              badge: "promo",
              keywords: ["promotional access", "temporary tier", "free upgrade", "contributor trial", "professional trial"]
            },
            {
              href: "/admin/actions/launch-access?tool=founder-pricing",
              title: "Founder Pricing",
              category: "Membership And Launch",
              description: "Review founder subscription pricing, caps, windows, and credit budgets.",
              badge: "pricing",
              keywords: ["founder pricing", "launch price", "subscription price", "contributor price", "professional price"]
            },
            {
              href: "/admin/actions/launch-access?tool=review",
              title: "Review Active Access",
              category: "Membership And Launch",
              description: "Review active promotional grants and recently generated free-account invite codes.",
              badge: "review",
              keywords: ["review access", "active grants", "invite review", "launch access"]
            }
          ]
        },
        {
          key: "membership-operations",
          title: "Membership Operations",
          description: "Direct tier operations for known accounts.",
          entries: [
            {
              href: "/admin/actions/tier-policy",
              title: "Global Tier Permissions",
              category: "Membership And Launch",
              description: "God-only matrix editor for global tier capability assignments.",
              badge: "God",
              keywords: ["god", "tier", "membership", "permissions", "global policy", "free tier", "auditor profile"]
            },
            {
              href: "/admin/actions/status-change",
              title: "Status Change",
              category: "Membership And Launch",
              description: "Permanently change an account's membership tier.",
              badge: "tier",
              keywords: ["membership", "tier", "status change", "account status", "free", "contributor", "professional", "auditor"]
            }
          ]
        }
      ]
    },
    {
      key: "ads-spend",
      href: "/admin/workflows/ads-spend",
      title: "Ads And Spend",
      eyebrow: "Ads",
      description: "Pricing, credits, placement costs, and ad-experience guardrails.",
      badge: "4 tools",
      keywords: ["ads", "ad spend", "credits", "pricing", "guardrails", "placements", "schedule", "auction"],
      groups: [
        {
          key: "pricing-credit-controls",
          title: "Pricing And Credit Controls",
          description: "Manage platform-credit costs and member ad-credit adjustments.",
          entries: [
            {
              href: "/admin/actions/platform-pricing",
              title: "Pricing Rules",
              category: "Ads And Spend",
              description: "Set global credit costs for listings, boosts, mail ads, and placements.",
              badge: "costs",
              keywords: ["ad spend", "ads", "pricing", "costs", "boost price", "listing price", "mail ad price"]
            },
            {
              href: "/admin/actions/platform-credits",
              title: "Member Credits",
              category: "Ads And Spend",
              description: "Grant or remove platform-only credits with a ledger entry and audit trail.",
              badge: "credits",
              keywords: ["ad spend", "credits", "grant credits", "remove credits", "member balance", "platform credits"]
            }
          ]
        },
        {
          key: "experience-controls",
          title: "Experience And Schedule Controls",
          description: "Review density, cooldown, sponsored-message boundaries, and display-time auction schedules.",
          entries: [
            {
              href: "/admin/actions/ad-schedule",
              title: "Global Ad Schedule",
              category: "Ads And Spend",
              description: "Force a recalculation of display-time schedules for the rest of today without skipping the next midnight calculation.",
              badge: "schedule",
              keywords: ["ads", "ad schedule", "auction", "display time", "placements", "recalculate", "rotation"]
            },
            {
              href: "/admin/actions/launch-access?tool=ad-guardrails",
              title: "Experience Guardrails",
              category: "Ads And Spend",
              description: "Review ad density, sponsored mail caps, sender cooldowns, and boost limits.",
              badge: "guardrails",
              keywords: ["ad spend", "ads", "spam", "guardrails", "density", "sponsored mail", "cooldown", "boost limit"]
            }
          ]
        }
      ]
    },
    {
      key: "billing",
      href: "/admin/workflows/billing",
      title: "Billing And Payments",
      eyebrow: "Billing",
      description: "Stripe connection, webhook readiness, subscriptions, and ad-credit checkout packages.",
      badge: "1 tool",
      keywords: ["billing", "stripe", "checkout", "payments", "subscription", "webhook"],
      groups: [
        {
          key: "payment-configuration",
          title: "Payment Configuration",
          description: "Keep external payment plumbing separate from account and ad operations.",
          entries: [
            {
              href: "/admin/actions/stripe-setup",
              title: "Stripe Setup",
              category: "Billing And Payments",
              description: "Configure Stripe keys, webhook readiness, subscription price IDs, and ad-credit checkout packages.",
              badge: "stripe",
              keywords: ["stripe", "billing", "checkout", "subscription", "webhook", "price id", "credit package", "payments"]
            }
          ]
        }
      ]
    },
    {
      key: "communications-safety",
      href: "/admin/workflows/communications-safety",
      title: "Communications And Safety",
      eyebrow: "Trust",
      description: "Admin announcements, support queues, bug reports, abuse reports, and content reports.",
      badge: openFeedbackTicketCount > 0 ? `${openFeedbackTicketCount} open` : "2 tools",
      keywords: ["announcements", "reports", "support", "safety", "abuse", "content", "tickets"],
      groups: [
        {
          key: "broadcasts-queues",
          title: "Broadcasts And Queues",
          description: "Separate outbound platform notices from inbound trust and support work.",
          entries: [
            {
              href: "/admin/actions/announcements",
              title: "Public Announcement",
              category: "Communications And Safety",
              description: "Send global, tier-specific, or targeted notices through approved channels.",
              badge: "notice",
              keywords: ["announcement", "broadcast", "global message", "popup", "mail", "chat notice"]
            },
            {
              href: "/admin/actions/reports-queue",
              title: "Reports Queue",
              category: "Communications And Safety",
              description: "Review bug reports, abuse reports, content reports, and support tickets.",
              badge: openFeedbackTicketCount > 0 ? `${openFeedbackTicketCount} open` : "queue",
              keywords: ["report issue", "tickets", "support", "bug", "abuse", "feedback", "content report"]
            }
          ]
        }
      ]
    },
    {
      key: "platform-controls",
      href: "/admin/workflows/platform-controls",
      title: "Platform Controls",
      eyebrow: "Admin",
      description: "Operational switches and broad platform review surfaces that do not belong to a single account.",
      badge: "2 tools",
      keywords: ["feature flags", "configuration", "launch review", "admin"],
      groups: [
        {
          key: "configuration",
          title: "Configuration",
          description: "Use these for broad platform operation, not user-specific support.",
          entries: [
            {
              href: "/admin/actions/feature-flags",
              title: "Feature Flags",
              category: "Platform Controls",
              description: "Turn risky or unfinished modules on/off without redeploying.",
              badge: "flags",
              keywords: ["toggle feature", "enable module", "disable module", "configuration", "flags"]
            },
            {
              href: "/admin/actions/launch-access",
              title: "Launch Access Hub",
              category: "Platform Controls",
              description: "Open the launch access hub for founder pricing, invites, grants, guardrails, and reviews.",
              badge: "hub",
              keywords: ["launch access", "hub", "founder pricing", "invite", "promo", "guardrails"]
            }
          ]
        }
      ]
    }
  ];
}

export function getAdminWorkflowCategory(openFeedbackTicketCount: number, workflowKey: string) {
  return buildWorkflowCategories(openFeedbackTicketCount).find((category) => category.key === workflowKey) ?? null;
}

export function getAdminWorkflowGroup(openFeedbackTicketCount: number, workflowKey: string, groupKey: string) {
  const category = getAdminWorkflowCategory(openFeedbackTicketCount, workflowKey);
  const group = category?.groups.find((candidate) => candidate.key === groupKey) ?? null;

  if (!category || !group) {
    return null;
  }

  return { category, group };
}

export function getAdminWorkflowGroupHref(workflowKey: string, groupKey: string) {
  return `/admin/workflows/${workflowKey}/${groupKey}`;
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function matchesWorkflowSearch(entry: AdminFunctionEntry, query: string) {
  const terms = normalize(query).split(" ").filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = normalize([entry.title, entry.category, entry.description, entry.badge, ...entry.keywords].join(" "));
  return terms.every((term) => haystack.includes(term));
}

export function flattenWorkflowEntries(categories: AdminWorkflowCategory[]) {
  const byHrefAndTitle = new Map<string, AdminFunctionEntry>();

  categories.forEach((category) => {
    category.groups.forEach((group) => {
      group.entries.forEach((entry) => {
        byHrefAndTitle.set(`${entry.href}:${entry.title}`, entry);
      });
    });
  });

  return [...byHrefAndTitle.values()];
}
