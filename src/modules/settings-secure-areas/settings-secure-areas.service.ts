import type { SettingsCard } from "@/modules/settings-secure-areas/types";

export const settingsCards: SettingsCard[] = [
  {
    title: "Profile",
    description: "Edit Profile, My Pics, My Scientology, My Resume, interests, and public profile links.",
    href: "/settings/profile",
    sensitive: false,
    badge: "Profile"
  },
  {
    title: "Security",
    description: "Blocked users, login security, password reset, site visibility, and account protection.",
    href: "/secure-area?next=/settings/security",
    sensitive: true,
    badge: "Security"
  },
  {
    title: "Rules",
    description: "Notification rules, alert cleanup, and stream behavior settings.",
    href: "/secure-area?next=/settings/rules",
    sensitive: true,
    badge: "Rules"
  },
  {
    title: "Reports and Commendations",
    description: "Review conduct reports concerning your account, reports you submitted, commendations, disputes, and temporary communication restrictions.",
    href: "/settings/reports",
    sensitive: false,
    badge: "Conduct"
  },
  {
    title: "Tutorial",
    description: "Replay the guided Theta-Space walkthrough or jump directly to one part.",
    href: "/settings/tutorial",
    sensitive: false,
    badge: "Help"
  },
  {
    title: "Users Manual",
    description: "Open the Free Tier user manual with per-feature explanations, limits, and FAQ.",
    href: "/settings/users-manual",
    sensitive: false,
    badge: "Help"
  },
  {
    title: "Progression Path",
    description: "Explore the interactive path from core Free features to the Contributor experience.",
    href: "/settings/progression-path",
    sensitive: false,
    badge: "Roadmap"
  },
  {
    title: "Feedback Center",
    description: "Ask for help, report a problem, or suggest an improvement to Theta-Space.",
    href: "/settings/feedback",
    sensitive: false,
    badge: "Help"
  },
  {
    title: "Subscription",
    description: "Your currently enabled membership, billing status, storage, and available credits.",
    href: "/secure-area?next=/settings/subscription",
    sensitive: true,
    badge: "Account"
  },
  {
    title: "Invites",
    description: "Create invite codes and review unused private membership invites when your account is eligible.",
    href: "/secure-area?next=/settings/invite",
    sensitive: true,
    badge: "Invites"
  }
];

export function getSettingsCards({
  includeInvites = true,
  includeFeedback = true
}: { includeInvites?: boolean; includeFeedback?: boolean } = {}) {
  return settingsCards.filter((card) => {
    if (!includeInvites && card.badge === "Invites") return false;
    if (!includeFeedback && card.title === "Feedback Center") return false;
    return true;
  });
}
