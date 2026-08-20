import { readPlatformEnv } from "@/lib/platform/env";

const defaults = {
  system: "noreply@theta-space.net",
  admin: "admin@theta-space.net",
  support: "support@theta-space.net",
  billing: "billing@theta-space.net",
  feedback: "feedback@theta-space.net",
  legal: "legal@theta-space.net",
  privacy: "privacy@theta-space.net",
  security: "security@theta-space.net",
  invite: "invite@theta-space.net",
  memberBase: "theta@theta-space.net"
} as const;

export function readPlatformMailboxes() {
  const env = readPlatformEnv();
  const support = env.SUPPORT_MAIL_FROM ?? defaults.support;
  const invite = env.INVITE_MAIL_FROM ?? defaults.invite;

  return {
    system: env.SYSTEM_MAIL_FROM ?? env.MICROSOFT_GRAPH_SENDER ?? defaults.system,
    admin: env.ADMIN_MAIL_FROM ?? defaults.admin,
    support,
    billing: env.BILLING_MAIL_FROM ?? defaults.billing,
    feedback: env.FEEDBACK_MAIL_FROM ?? defaults.feedback,
    legal: env.LEGAL_MAIL_FROM ?? defaults.legal,
    privacy: env.PRIVACY_MAIL_FROM ?? defaults.privacy,
    security: env.SECURITY_MAIL_FROM ?? defaults.security,
    invite,
    inviteReplyTo: env.INVITE_MAIL_REPLY_TO ?? support,
    event: env.EVENT_MAIL_FROM ?? invite,
    storefront: env.STOREFRONT_MAIL_FROM ?? support,
    memberBase: env.MEMBER_MAIL_BASE_ADDRESS ?? defaults.memberBase
  };
}
