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
    description: "Notification rules, alert cleanup, mail preferences, and stream behavior settings.",
    href: "/secure-area?next=/settings/rules",
    sensitive: true,
    badge: "Rules"
  },
  {
    title: "Subscription",
    description: "Current subscription, upgrade or downgrade options, receipts, and available credits.",
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

export function getSettingsCards({ includeInvites = true }: { includeInvites?: boolean } = {}) {
  if (includeInvites) return settingsCards;
  return settingsCards.filter((card) => card.badge !== "Invites");
}
