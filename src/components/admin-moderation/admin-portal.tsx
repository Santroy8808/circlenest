"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AdminPortalView } from "@/modules/admin-moderation/types";

type AdminFunctionEntry = {
  href: string;
  title: string;
  category: string;
  description: string;
  badge: string;
  keywords: string[];
};

type AdminWorkflowGroup = {
  title: string;
  description: string;
  entries: AdminFunctionEntry[];
};

type AdminWorkflowCategory = {
  key: string;
  title: string;
  eyebrow: string;
  description: string;
  badge: string;
  keywords: string[];
  groups: AdminWorkflowGroup[];
};

function buildWorkflowCategories(openFeedbackTicketCount: number): AdminWorkflowCategory[] {
  return [
    {
      key: "account-management",
      title: "Account Management",
      eyebrow: "Users",
      description: "Start with account lookup, invite/create flows, then move into account-specific support, membership, ad-credit, and report actions.",
      badge: "6 tools",
      keywords: ["user", "account", "invite", "create user", "reset password", "membership", "credits", "reports"],
      groups: [
        {
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
      title: "Membership And Launch",
      eyebrow: "Access",
      description: "Global membership configuration, launch grants, founder pricing, and temporary access programs.",
      badge: "4 tools",
      keywords: ["membership", "launch", "founder", "pricing", "promo", "promotion", "temporary access"],
      groups: [
        {
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
          title: "Membership Operations",
          description: "Direct tier operations for known accounts.",
          entries: [
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
      title: "Ads And Spend",
      eyebrow: "Ads",
      description: "Pricing, credits, placement costs, and ad-experience guardrails.",
      badge: "3 tools",
      keywords: ["ads", "ad spend", "credits", "pricing", "guardrails", "placements"],
      groups: [
        {
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
          title: "Experience Controls",
          description: "Review density, cooldown, and sponsored-message boundaries.",
          entries: [
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
      title: "Billing And Payments",
      eyebrow: "Billing",
      description: "Stripe connection, webhook readiness, subscriptions, and ad-credit checkout packages.",
      badge: "1 tool",
      keywords: ["billing", "stripe", "checkout", "payments", "subscription", "webhook"],
      groups: [
        {
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
      title: "Communications And Safety",
      eyebrow: "Trust",
      description: "Admin announcements, support queues, bug reports, abuse reports, and content reports.",
      badge: openFeedbackTicketCount > 0 ? `${openFeedbackTicketCount} open` : "2 tools",
      keywords: ["announcements", "reports", "support", "safety", "abuse", "content", "tickets"],
      groups: [
        {
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
      title: "Platform Controls",
      eyebrow: "Admin",
      description: "Operational switches and broad platform review surfaces that do not belong to a single account.",
      badge: "2 tools",
      keywords: ["feature flags", "configuration", "launch review", "admin"],
      groups: [
        {
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

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchesSearch(entry: AdminFunctionEntry, query: string) {
  const terms = normalize(query).split(" ").filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = normalize([entry.title, entry.category, entry.description, entry.badge, ...entry.keywords].join(" "));
  return terms.every((term) => haystack.includes(term));
}

function flattenEntries(categories: AdminWorkflowCategory[]) {
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

function LogList({ logs }: { logs: AdminPortalView["recentAuditLogs"] }) {
  return (
    <div className="mt-4 grid gap-2">
      {logs.length > 0 ? (
        logs.map((log) => (
          <article className="rounded-md border border-[var(--line)] bg-black/10 p-3" key={log.id}>
            <p className="font-semibold">{log.label}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{log.detail}</p>
          </article>
        ))
      ) : (
        <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">No recent entries.</p>
      )}
    </div>
  );
}

function FunctionCard({ entry }: { entry: AdminFunctionEntry }) {
  return (
    <Link className="admin-function-card rounded-md p-5" href={entry.href}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{entry.category}</p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--gold)]">{entry.title}</h3>
        </div>
        <span className="pill rounded-full px-3 py-1 text-xs">{entry.badge}</span>
      </div>
      <p className="mt-3 leading-6 text-[var(--muted)]">{entry.description}</p>
    </Link>
  );
}

export function AdminPortal({ portal }: { portal: AdminPortalView }) {
  const [query, setQuery] = useState("");
  const categories = useMemo(() => buildWorkflowCategories(portal.openFeedbackTicketCount), [portal.openFeedbackTicketCount]);
  const [activeCategoryKey, setActiveCategoryKey] = useState(categories[0]?.key ?? "account-management");
  const activeCategory = categories.find((category) => category.key === activeCategoryKey) ?? categories[0];
  const searchEntries = useMemo(() => flattenEntries(categories), [categories]);
  const visibleEntries = useMemo(() => searchEntries.filter((entry) => matchesSearch(entry, query)), [query, searchEntries]);
  const showingSearch = query.trim().length > 0;

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Portal</p>
        <h1 className="mt-3 text-3xl font-semibold">Guided platform operations</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Start with the operational subject, then drill into the specific function. Real-money balances are intentionally outside direct admin mutation.
        </p>
        <label className="mt-5 grid gap-2">
          <span className="form-label">Search admin functions</span>
          <input
            aria-label="Search admin functions"
            className="form-field"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try: account, create invite, reset password, membership, ad spend, reports"
            type="search"
            value={query}
          />
        </label>
      </section>

      {showingSearch ? (
        <section className="surface rounded-md p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Search Results</p>
              <h2 className="mt-2 text-2xl font-semibold">{visibleEntries.length} matching function{visibleEntries.length === 1 ? "" : "s"}</h2>
            </div>
            <button className="btn-secondary" onClick={() => setQuery("")} type="button">
              Clear search
            </button>
          </div>
          <div className="admin-function-grid mt-5">
            {visibleEntries.length > 0 ? (
              visibleEntries.map((entry) => <FunctionCard entry={entry} key={`${entry.href}:${entry.title}`} />)
            ) : (
              <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">No admin functions match that search.</p>
            )}
          </div>
        </section>
      ) : (
        <>
          <section className="surface rounded-md p-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Functions</p>
              <h2 className="mt-2 text-2xl font-semibold">Choose a subject</h2>
            </div>
            <div className="admin-category-grid mt-5">
              {categories.map((category) => (
                <button
                  className={category.key === activeCategory?.key ? "admin-category-card is-active rounded-md p-5 text-left" : "admin-category-card rounded-md p-5 text-left"}
                  key={category.key}
                  onClick={() => setActiveCategoryKey(category.key)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{category.eyebrow}</p>
                      <h3 className="mt-2 text-xl font-semibold text-[var(--gold)]">{category.title}</h3>
                    </div>
                    <span className="pill rounded-full px-3 py-1 text-xs">{category.badge}</span>
                  </div>
                  <p className="mt-3 leading-6 text-[var(--muted)]">{category.description}</p>
                </button>
              ))}
            </div>
          </section>

          {activeCategory ? (
            <section className="surface rounded-md p-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{activeCategory.eyebrow}</p>
                <h2 className="mt-2 text-2xl font-semibold">{activeCategory.title}</h2>
                <p className="mt-2 max-w-3xl leading-7 text-[var(--muted)]">{activeCategory.description}</p>
              </div>
              <div className="mt-5 grid gap-5">
                {activeCategory.groups.map((group) => (
                  <div className="admin-workflow-group rounded-md p-4" key={group.title}>
                    <div className="mb-4">
                      <h3 className="text-xl font-semibold text-[var(--gold)]">{group.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{group.description}</p>
                    </div>
                    <div className="admin-function-grid">
                      {group.entries.map((entry) => (
                        <FunctionCard entry={entry} key={`${entry.href}:${entry.title}`} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      <section className="surface rounded-md p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--gold)]">Platform Metrics</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Metadata only: login/session signals, route views, actions, and aggregate route movement. No mail, chat, or post content is read here.
            </p>
          </div>
          <div className="grid gap-2 text-right sm:grid-cols-3">
            <span className="pill rounded-full px-3 py-2 text-xs">{portal.activitySummary.activeUsers15m} active / 15m</span>
            <span className="pill rounded-full px-3 py-2 text-xs">{portal.activitySummary.pageViews24h} page views / 24h</span>
            <span className="pill rounded-full px-3 py-2 text-xs">{portal.activitySummary.actions24h} actions / 24h</span>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {portal.activitySummary.topRoutes24h.length > 0 ? (
            portal.activitySummary.topRoutes24h.map((route) => (
              <article className="rounded-md border border-[var(--line)] bg-black/10 p-3" key={route.route}>
                <p className="truncate font-semibold">{route.route}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">{route.count} view(s)</p>
              </article>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)] md:col-span-3">No route activity yet.</p>
          )}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="surface rounded-md p-5">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Feature Flags</h2>
          <div className="mt-4 grid gap-2">
            {portal.featureFlags.length > 0 ? (
              portal.featureFlags.map((flag) => (
                <article className="rounded-md border border-[var(--line)] bg-black/10 p-3" key={flag.key}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{flag.key}</p>
                    <span className="pill rounded-full px-3 py-1 text-xs">{flag.enabled ? "on" : "off"}</span>
                  </div>
                  {flag.description ? <p className="mt-1 text-sm text-[var(--muted)]">{flag.description}</p> : null}
                </article>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">No feature flags yet.</p>
            )}
          </div>
        </div>
        <div className="surface rounded-md p-5">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Recent Audit</h2>
          <LogList logs={portal.recentAuditLogs} />
        </div>
        <div className="surface rounded-md p-5 lg:col-span-2">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Recent Diagnostics</h2>
          <LogList logs={portal.recentDiagnostics} />
        </div>
      </section>
    </div>
  );
}
