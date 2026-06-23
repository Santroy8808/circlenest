import type { SettingsCard } from "@/modules/settings-secure-areas/types";

export const settingsCards: SettingsCard[] = [
  {
    title: "Profile",
    description: "Profile, My Pics, My Scientology, theme, and public identity links.",
    href: "/settings/profile",
    sensitive: false,
    badge: "Profile"
  },
  {
    title: "Security",
    description: "Password, sessions, blocked users, admin mode, and account protection.",
    href: "/secure-area?next=/settings/security",
    sensitive: true,
    badge: "Security"
  },
  {
    title: "Subscription",
    description: "Membership tier, receipts, billing status, and upgrade/downgrade history.",
    href: "/secure-area?next=/settings/subscription",
    sensitive: true,
    badge: "Account"
  },
  {
    title: "Notification Rules",
    description: "Notification dings, quiet rules, mail opt-outs, and alert preferences.",
    href: "/secure-area?next=/settings/notifications",
    sensitive: true,
    badge: "Rules"
  },
  {
    title: "My Invite Codes",
    description: "Your invite eligibility and unused private membership invite codes.",
    href: "/secure-area?next=/settings/invite",
    sensitive: true,
    badge: "Invites"
  }
];

export function getSettingsCards() {
  return settingsCards;
}
