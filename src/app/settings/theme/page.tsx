import { AppShell } from "@/components/layout/app-shell";
import { ThemeSettingsClient } from "@/components/settings/theme-settings-client";

export default function ThemeSettingsPage() {
  return (
    <AppShell>
      <ThemeSettingsClient />
    </AppShell>
  );
}
