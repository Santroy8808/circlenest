import { redirect } from "next/navigation";

export default function SettingsSecurityInviteRedirectPage() {
  redirect("/settings/invitations");
}
