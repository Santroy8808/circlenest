import type { PlatformModuleDefinition } from "@/modules/platform-infrastructure/types";

export const moduleDefinitions: PlatformModuleDefinition[] = [
  {
    key: "platform-infrastructure",
    title: "Platform Infrastructure",
    status: "ready",
    purpose: "Scaffold, Postgres, diagnostics, feature flags, R2, health, and visual shell.",
    href: "/docs/modules/01-platform-infrastructure"
  },
  {
    key: "feedback-support",
    title: "Feedback Support",
    status: "ready",
    purpose: "Global report-an-issue entry, ticket creation, and diagnostic context capture.",
    href: "/docs/modules/01a-feedback-support"
  },
  {
    key: "auth-security",
    title: "Auth Security",
    status: "ready",
    purpose: "Private member login, signup, verification, session and password security.",
    href: "/docs/modules/02-auth-security"
  },
  {
    key: "membership-policy",
    title: "Membership Policy",
    status: "ready",
    purpose: "Free, Contributor, Professional, Auditor, and Admin capability gates.",
    href: "/docs/modules/03-membership-policy"
  },
  {
    key: "profile-identity",
    title: "Profile Identity",
    status: "ready",
    purpose: "Profile cards, avatar/banner, public identity, and member expression boundaries.",
    href: "/docs/modules/04-profile-identity"
  },
  {
    key: "my-scientology",
    title: "My Scientology",
    status: "ready",
    purpose: "Scientology-specific member context, privacy, qualification, and auditor education data.",
    href: "/docs/modules/05-my-scientology"
  },
  {
    key: "gallery-media-storage",
    title: "Gallery Media Storage",
    status: "ready",
    purpose: "My Pics, direct R2 uploads, recent-first gallery, tags, albums, and date collections.",
    href: "/docs/modules/06-gallery-media-storage"
  },
  {
    key: "feed-stream",
    title: "Feed Stream",
    status: "ready",
    purpose: "Facebook-like social stream with less manipulative ranking and cleaner comments.",
    href: "/docs/modules/07-feed-stream"
  },
  {
    key: "social-graph",
    title: "Social Graph",
    status: "ready",
    purpose: "Friends, family, contacts, follows, blocks, mutes, and people cards.",
    href: "/docs/modules/08-social-graph"
  },
  {
    key: "notifications-alerts",
    title: "Notifications Alerts",
    status: "ready",
    purpose: "Unread counters, social notifications, special alerts inbox, and hover-safe cards.",
    href: "/docs/modules/09-notifications-alerts"
  },
  {
    key: "chat-messages",
    title: "Chat Messages",
    status: "ready",
    purpose: "Chat-only direct/group conversations with attachments and no desktop push-token setup UI.",
    href: "/docs/modules/10-chat-messages"
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

export const milestoneDefinitions = [
  {
    label: "Phase 1",
    title: "Platform foundation",
    status: "Ready",
    detail: "NewRepo scaffold, Postgres schema baseline, R2 boundary, feature flags, diagnostics, health, and docs."
  },
  {
    label: "Foundation add-on",
    title: "Feedback tickets",
    status: "Ready",
    detail: "Global report button, ticket API, support schema, and page context capture."
  },
  {
    label: "Phase 2",
    title: "Auth security",
    status: "Ready",
    detail: "Credentials auth, seed users, verification/reset tokens, session revocation, and security events."
  },
  {
    label: "Phase 3",
    title: "Membership policy",
    status: "Ready",
    detail: "Tier matrix and gates for Free, Contributor, Professional, Auditor, and Admin role separation."
  },
  {
    label: "Phase 4",
    title: "Profile identity",
    status: "Ready",
    detail: "Profile cards, avatar/banner selection, public identity, and MySpace-style expression boundaries."
  },
  {
    label: "Phase 5",
    title: "My Scientology",
    status: "Ready",
    detail: "Scientology-specific profile fields, privacy controls, and classification boundaries."
  },
  {
    label: "Phase 6",
    title: "Gallery media storage",
    status: "Ready",
    detail: "My Pics, R2 direct uploads, tags/albums as organization layers, and mobile-safe upload UX."
  },
  {
    label: "Phase 7",
    title: "Feed stream",
    status: "Ready",
    detail: "Social stream, composer, comments/replies, reactions, and no full-page reload action patterns."
  },
  {
    label: "Phase 8",
    title: "Social graph",
    status: "Ready",
    detail: "Friends, contacts, family tags, follows, blocks, mutes, and sortable people cards."
  },
  {
    label: "Phase 9",
    title: "Notifications alerts",
    status: "Ready",
    detail: "Unread counters, notifications, alerts inbox, hover-safe cards, and report/admin notices."
  },
  {
    label: "Phase 10",
    title: "Chat messages",
    status: "Ready",
    detail: "Chat-only dock/window, mobile chat page, attachments, and no desktop push-token setup UI."
  },
  {
    label: "Phase 11",
    title: "Mail",
    status: "Next",
    detail: "Mail-only internal client, contacts separate from friends, multi-recipient sends, and mass-mail infrastructure."
  }
];
