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
    status: "ready",
    purpose: "Private community spaces with forums, media, docs, and scoped moderation.",
    href: "/docs/modules/12-groups"
  },
  {
    key: "mail",
    title: "Mail",
    status: "ready",
    purpose: "Gmail-like internal mail, contacts, and multi-recipient send.",
    href: "/docs/modules/11-mail"
  },
  {
    key: "group-forum",
    title: "Group Forum",
    status: "ready",
    purpose: "Collapsed group threads, full-thread discussions, reactions, and end-thread controls.",
    href: "/docs/modules/13-group-forum"
  },
  {
    key: "group-media-docs",
    title: "Group Media Docs",
    status: "ready",
    purpose: "Simple group gallery and documents with provider/moderator upload rights and storage caps.",
    href: "/docs/modules/14-group-media-docs"
  },
  {
    key: "events",
    title: "Events",
    status: "ready",
    purpose: "Invite-based events with scoped moderators, RSVP structure, and ad-system handoff.",
    href: "/docs/modules/15-events"
  },
  {
    key: "market",
    title: "Market",
    status: "ready",
    purpose: "Square thumbnail listings, static categories, tier limits, and clean ad handoff.",
    href: "/docs/modules/16-market"
  },
  {
    key: "jobs",
    title: "Jobs",
    status: "ready",
    purpose: "Browsable job board with Professional-only creation and full detail/contact pages.",
    href: "/docs/modules/17-jobs"
  },
  {
    key: "auditors",
    title: "Auditors",
    status: "ready",
    purpose: "Find an Auditor directory with Auditor-account profile creation and My Scientology education pull-through.",
    href: "/docs/modules/18-auditors"
  },
  {
    key: "production-zone",
    title: "Production Zone",
    status: "ready",
    purpose: "Tier-aware hub for production, creator, professional, and business workflows.",
    href: "/docs/modules/19-production-zone"
  },
  {
    key: "business-storefront",
    title: "Business Storefront",
    status: "ready",
    purpose: "Professional business profile, public storefront, inquiry capture, and email-linking placeholder.",
    href: "/docs/modules/20-business-storefront"
  },
  {
    key: "ads-credits",
    title: "Ads Credits",
    status: "ready",
    purpose: "Ad campaign manager, platform-credit reservation, privacy-aware targeting, and delivery diagnostics.",
    href: "/docs/modules/21-ads-credits"
  },
  {
    key: "fundraisers-funds",
    title: "Fundraisers Funds",
    status: "ready",
    purpose: "Campaign pages, contribution intents, payment-ready schema, and real-money boundary controls.",
    href: "/docs/modules/22-fundraisers-funds"
  },
  {
    key: "writers-corner",
    title: "Writers Corner",
    status: "ready",
    purpose: "Manuscripts, chapters, creator editing, autosave-ready schema, and reader navigation.",
    href: "/docs/modules/23-writers-corner"
  },
  {
    key: "admin-moderation",
    title: "Admin Moderation",
    status: "ready",
    purpose: "Wizard-based admin action cards, feature flags, audit visibility, diagnostics, and safe operation boundaries.",
    href: "/docs/modules/24-admin-moderation"
  },
  {
    key: "settings-secure-areas",
    title: "Settings Secure Areas",
    status: "ready",
    purpose: "Card-first settings hub, secure-area prompt, sensitive settings split, and gallery outside secure wall.",
    href: "/docs/modules/25-settings-secure-areas"
  },
  {
    key: "search-discovery",
    title: "Search Discovery",
    status: "ready",
    purpose: "Unified privacy-aware search across people, groups, Market, jobs, auditors, writing, and visible posts.",
    href: "/docs/modules/26-search-discovery"
  },
  {
    key: "cutover-readiness",
    title: "Cutover Readiness",
    status: "ready",
    purpose: "Non-destructive release gates, smoke matrix, rollback rules, and production promotion checklist.",
    href: "/cutover"
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
    status: "Ready",
    detail: "Mail-only internal client, contacts separate from friends, multi-recipient sends, and mass-mail infrastructure."
  },
  {
    label: "Phase 12",
    title: "Groups",
    status: "Ready",
    detail: "Group directory cards, joined/my toggle, create-group wizard, public/private groups, and admin visibility."
  },
  {
    label: "Phase 13",
    title: "Group forum",
    status: "Ready",
    detail: "Collapsed group threads, full-thread view, end-thread behavior, moderator delete flow, reactions, and photo replies."
  },
  {
    label: "Phase 14",
    title: "Group media docs",
    status: "Ready",
    detail: "Simple group gallery/docs, provider/moderator upload rights, storage cap, comments, and no overbuilt album UI."
  },
  {
    label: "Phase 15",
    title: "Events",
    status: "Ready",
    detail: "Invite-based events, RSVP-ready detail pages, scoped event moderators, and promote-event handoff to ads."
  },
  {
    label: "Phase 16",
    title: "Market",
    status: "Ready",
    detail: "The Market listings as square thumbnail cards, static categories, detail pages, and tier limits."
  },
  {
    label: "Phase 17",
    title: "Jobs",
    status: "Ready",
    detail: "Browsable job board for all tiers, Professional-only creation, static categories, and detail/contact pages."
  },
  {
    label: "Phase 18",
    title: "Auditors",
    status: "Ready",
    detail: "Find an Auditor directory, Auditor-account profile creation, searchable listings, and My Scientology education pull-through."
  },
  {
    label: "Phase 19",
    title: "Production Zone",
    status: "Ready",
    detail: "Clean control-panel hub for Events, Market, Jobs, Auditors, Writers, Fundraisers, and Business Center by tier."
  },
  {
    label: "Phase 20",
    title: "Business Storefront",
    status: "Ready",
    detail: "Professional business profile, public storefront, public inquiry flow, and email-linking placeholder."
  },
  {
    label: "Phase 21",
    title: "Ads Credits",
    status: "Ready",
    detail: "Transparent ad creation, targeting by permitted fields, credits, placement rules, and delivery diagnostics."
  },
  {
    label: "Phase 22",
    title: "Fundraisers Funds",
    status: "Ready",
    detail: "Professional fundraiser rules, campaign pages, internal payments-ready structure, and money boundary controls."
  },
  {
    label: "Phase 23",
    title: "Writers Corner",
    status: "Ready",
    detail: "Manuscripts, chapters, autosave, RTF editor, readable chapter viewer, and page-turn navigation."
  },
  {
    label: "Phase 24",
    title: "Admin Moderation",
    status: "Ready",
    detail: "Wizard-based admin operations, reports queue, audit viewer, feature flags, and role preview."
  },
  {
    label: "Phase 25",
    title: "Settings Secure Areas",
    status: "Ready",
    detail: "Settings cards, password-protected sensitive areas, notification rules, subscription, security, and invite controls."
  },
  {
    label: "Phase 26",
    title: "Search Discovery",
    status: "Ready",
    detail: "Unified privacy-aware search across people, groups, Market, jobs, auditors, writing, and allowed posts."
  },
  {
    label: "Cutover",
    title: "Production cutover readiness",
    status: "Ready",
    detail: "Archive current production, tag rollback, verify Windows service deployment, PostgreSQL migrations, R2 media, and login smoke tests."
  },
  {
    label: "Live Cutover",
    title: "Manual production promotion",
    status: "Next",
    detail: "Requires explicit approval, a verified archive tag, clean production repo mapping, GitHub push, and Windows service smoke tests."
  }
];
