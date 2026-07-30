import { auth } from "@/auth";
import { GlobalFeedbackLink } from "@/components/feedback/global-feedback-link";

export async function GlobalFeedbackLinkGate() {
  const session = await auth();
  if (!session?.user || session.user.revoked) return null;

  return <GlobalFeedbackLink />;
}
