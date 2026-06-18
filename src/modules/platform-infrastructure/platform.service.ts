import type { PlatformModuleDefinition } from "@/modules/platform-infrastructure/types";

export const moduleDefinitions: PlatformModuleDefinition[] = [
  {
    key: "platform-infrastructure",
    title: "Platform Infrastructure",
    status: "in-progress",
    purpose: "Scaffold, Postgres, diagnostics, feature flags, R2, health, and visual shell.",
    href: "/docs/modules/01-platform-infrastructure"
  },
  {
    key: "auth-security",
    title: "Auth Security",
    status: "blueprint",
    purpose: "Private member login, signup, verification, session and password security.",
    href: "/docs/modules/02-auth-security"
  },
  {
    key: "membership-policy",
    title: "Membership Policy",
    status: "blueprint",
    purpose: "Free, Contributor, Professional, Auditor, and Admin capability gates.",
    href: "/docs/modules/03-membership-policy"
  },
  {
    key: "feed-stream",
    title: "Feed Stream",
    status: "blueprint",
    purpose: "Facebook-like social stream with less manipulative ranking and cleaner comments.",
    href: "/docs/modules/07-feed-stream"
  },
  {
    key: "groups",
    title: "Groups",
    status: "blueprint",
    purpose: "Private community spaces with forums, media, docs, and scoped moderation.",
    href: "/docs/modules/12-groups"
  },
  {
    key: "mail",
    title: "Mail",
    status: "blueprint",
    purpose: "Gmail-like internal mail, contacts, multi-recipient send, and future external mail.",
    href: "/docs/modules/11-mail"
  },
  {
    key: "market",
    title: "Market",
    status: "blueprint",
    purpose: "Square thumbnail listings, static categories, tier limits, and clean ad handoff.",
    href: "/docs/modules/16-market"
  },
  {
    key: "admin-moderation",
    title: "Admin Moderation",
    status: "blueprint",
    purpose: "Wizard-based admin operations, moderation, reports, audit, and feature flags.",
    href: "/docs/modules/24-admin-moderation"
  }
];

export function getModuleDefinitions() {
  return moduleDefinitions;
}
