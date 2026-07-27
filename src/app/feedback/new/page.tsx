import { redirect } from "next/navigation";

export default function LegacyNewFeedbackPage() {
  redirect("/settings/feedback");
}
