import { auth } from "@/auth";
import { GlobalFeedbackLink } from "@/components/feedback/global-feedback-link";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";

export async function GlobalFeedbackLinkGate() {
  const session = await auth();
  if (!session?.user || session.user.revoked) return null;

  const access = await canUserAccessFeature(session.user.id, "support.createRequest");
  if (!access.allowed) return null;

  return <GlobalFeedbackLink />;
}
