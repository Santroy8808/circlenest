export type SettingsCard = {
  title: string;
  description: string;
  href: string;
  sensitive: boolean;
  badge: "Profile" | "Security" | "Account" | "Rules" | "Preferences" | "Invites" | "Help" | "Conduct" | "Roadmap";
};
