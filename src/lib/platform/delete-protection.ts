import { NextResponse } from "next/server";
import { prisma } from "@/lib/platform/db";
import { verifyPassword } from "@/modules/auth-security/password";

export const DELETE_PASSWORD_FIELD = "deletePassword";
export const DELETE_PASSWORD_HEADER = "x-delete-password";
export const DEFAULT_DELETE_PASSWORD = "DELETE";
const DELETE_PROTECTION_CONFIG_ID = "default";
const DELETE_PASSWORD_CACHE_TTL_MS = 60_000;

let cachedDeletePasswordHash: string | null | undefined;
let cachedDeletePasswordLoadedAt = 0;

export const protectedRetentionTags = {
  finance: "RETENTION_FINANCE",
  auditTrail: "RETENTION_AUDIT_TRAIL",
  adminCommunication: "RETENTION_ADMIN_COMMUNICATION",
  businessCommunication: "RETENTION_BUSINESS_COMMUNICATION",
} as const;

export type ProtectedRetentionTag =
  (typeof protectedRetentionTags)[keyof typeof protectedRetentionTags];

export type ProtectedRetentionRecord = {
  table: string;
  tags: ProtectedRetentionTag[];
  reason: string;
};

export const protectedRetentionRecords = [
  {
    table: "AuditLog",
    tags: [protectedRetentionTags.auditTrail],
    reason: "Platform audit trail. Never hard-delete.",
  },
  {
    table: "AdminAction",
    tags: [
      protectedRetentionTags.auditTrail,
      protectedRetentionTags.adminCommunication,
    ],
    reason: "Administrator action history and admin communications.",
  },
  {
    table: "PublicAnnouncement",
    tags: [protectedRetentionTags.adminCommunication],
    reason: "Platform-wide/admin communication history.",
  },
  {
    table: "AdCreditLedgerEntry",
    tags: [protectedRetentionTags.finance, protectedRetentionTags.auditTrail],
    reason: "Financial credit ledger. Never hard-delete.",
  },
  {
    table: "AdDeliveryLog",
    tags: [protectedRetentionTags.finance, protectedRetentionTags.auditTrail],
    reason: "Ad delivery/accounting evidence.",
  },
  {
    table: "AdCampaign",
    tags: [protectedRetentionTags.finance],
    reason: "Paid or credit-backed advertising record.",
  },
  {
    table: "AdDisplayScheduleRun",
    tags: [protectedRetentionTags.finance, protectedRetentionTags.auditTrail],
    reason: "Ad schedule execution history.",
  },
  {
    table: "AdDisplayScheduleSlot",
    tags: [protectedRetentionTags.finance, protectedRetentionTags.auditTrail],
    reason: "Ad schedule allocation history.",
  },
  {
    table: "BillingCheckoutIntent",
    tags: [protectedRetentionTags.finance, protectedRetentionTags.auditTrail],
    reason:
      "Checkout/payment intent history. Card data is not stored by Theta-Space.",
  },
  {
    table: "StripeCheckoutFulfillment",
    tags: [protectedRetentionTags.finance, protectedRetentionTags.auditTrail],
    reason:
      "Stripe fulfillment history. Card data is not stored by Theta-Space.",
  },
  {
    table: "StripeWebhookEvent",
    tags: [protectedRetentionTags.finance, protectedRetentionTags.auditTrail],
    reason:
      "Stripe webhook audit trail. Card data is not stored by Theta-Space.",
  },
  {
    table: "StripeIntegrationConfig",
    tags: [protectedRetentionTags.finance],
    reason: "Payment integration configuration record.",
  },
  {
    table: "StripeCreditPackage",
    tags: [protectedRetentionTags.finance],
    reason: "Payment/credit package configuration record.",
  },
  {
    table: "PlatformCostRule",
    tags: [protectedRetentionTags.finance],
    reason: "Platform financial rule/configuration history.",
  },
  {
    table: "SubscriptionPlanRule",
    tags: [protectedRetentionTags.finance],
    reason: "Subscription billing rule/configuration history.",
  },
  {
    table: "FundraiserCampaign",
    tags: [protectedRetentionTags.finance],
    reason: "Fundraising financial record.",
  },
  {
    table: "FundLedgerEntry",
    tags: [protectedRetentionTags.finance, protectedRetentionTags.auditTrail],
    reason: "Fund ledger. Never hard-delete.",
  },
  {
    table: "FundContributionIntent",
    tags: [protectedRetentionTags.finance, protectedRetentionTags.auditTrail],
    reason: "Fund contribution/payment intent history.",
  },
  {
    table: "MailThread",
    tags: [protectedRetentionTags.businessCommunication],
    reason: "Business email/message thread.",
  },
  {
    table: "MailMessage",
    tags: [protectedRetentionTags.businessCommunication],
    reason: "Business email/message content.",
  },
  {
    table: "MailRecipient",
    tags: [protectedRetentionTags.businessCommunication],
    reason: "Business email/message delivery record.",
  },
  {
    table: "MailAttachment",
    tags: [protectedRetentionTags.businessCommunication],
    reason: "Business email/message attachment record.",
  },
  {
    table: "MailContact",
    tags: [protectedRetentionTags.businessCommunication],
    reason: "Business email/message contact record.",
  },
  {
    table: "MailPreference",
    tags: [protectedRetentionTags.businessCommunication],
    reason: "Business email/message preference record.",
  },
  {
    table: "MailPolicyConfig",
    tags: [protectedRetentionTags.businessCommunication],
    reason: "Business email/message policy configuration.",
  },
  {
    table: "MailSenderOptOut",
    tags: [protectedRetentionTags.businessCommunication],
    reason: "Business email/message opt-out record.",
  },
  {
    table: "BusinessInquiry",
    tags: [protectedRetentionTags.businessCommunication],
    reason: "Business inquiry/message record.",
  },
  {
    table: "ChatThread",
    tags: [protectedRetentionTags.adminCommunication],
    reason: "Only VITAL-tagged administrator communication threads are protected.",
  },
  {
    table: "ChatMessage",
    tags: [protectedRetentionTags.adminCommunication],
    reason: "Only messages belonging to a VITAL-tagged chat thread are protected.",
  },
  {
    table: "ChatParticipant",
    tags: [protectedRetentionTags.adminCommunication],
    reason: "Only participants belonging to a VITAL-tagged chat thread are protected.",
  },
  {
    table: "ChatAttachment",
    tags: [protectedRetentionTags.adminCommunication],
    reason: "Only attachments belonging to a VITAL-tagged chat thread are protected.",
  },
  {
    table: "ChatMessageReaction",
    tags: [protectedRetentionTags.adminCommunication],
    reason: "Only reactions belonging to a VITAL-tagged chat thread are protected.",
  },
  {
    table: "EncryptedChatThread",
    tags: [protectedRetentionTags.adminCommunication],
    reason: "Only VITAL-tagged encrypted administrator communication threads are protected.",
  },
  {
    table: "EncryptedChatMessage",
    tags: [protectedRetentionTags.adminCommunication],
    reason: "Only messages belonging to a VITAL-tagged encrypted chat thread are protected.",
  },
  {
    table: "EncryptedChatParticipant",
    tags: [protectedRetentionTags.adminCommunication],
    reason: "Only participants belonging to a VITAL-tagged encrypted chat thread are protected.",
  },
  {
    table: "EncryptedChatEnvelope",
    tags: [protectedRetentionTags.adminCommunication],
    reason: "Only envelopes belonging to a VITAL-tagged encrypted chat thread are protected.",
  },
] satisfies ProtectedRetentionRecord[];

export const protectedRetentionTables = protectedRetentionRecords.reduce<
  Record<string, ProtectedRetentionTag[]>
>((tables, record) => {
  tables[record.table] = record.tags;
  return tables;
}, {});

function getFallbackDeletePassword() {
  return process.env.DELETE_PASSWORD ?? process.env.DELETE_CONFIRMATION_PASSWORD ?? DEFAULT_DELETE_PASSWORD;
}

async function getStoredDeletePasswordHash() {
  const now = Date.now();
  if (cachedDeletePasswordLoadedAt && now - cachedDeletePasswordLoadedAt < DELETE_PASSWORD_CACHE_TTL_MS) {
    return cachedDeletePasswordHash ?? null;
  }

  const config = await prisma.deleteProtectionConfig.findUnique({
    where: { id: DELETE_PROTECTION_CONFIG_ID },
    select: { deletePasswordHash: true }
  });

  cachedDeletePasswordHash = config?.deletePasswordHash ?? null;
  cachedDeletePasswordLoadedAt = now;
  return cachedDeletePasswordHash;
}

export async function getDeletePassword() {
  return (await getStoredDeletePasswordHash()) ? "[configured]" : getFallbackDeletePassword();
}

export async function validateDeletePassword(value: unknown) {
  if (typeof value !== "string") return false;

  const storedDeletePasswordHash = await getStoredDeletePasswordHash();
  if (storedDeletePasswordHash) {
    return verifyPassword(value, storedDeletePasswordHash);
  }

  return value === getFallbackDeletePassword();
}

export function extractDeletePasswordFromBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }

  const record = body as Record<string, unknown>;
  return (
    record[DELETE_PASSWORD_FIELD] ??
    record.delete_password ??
    record.deletePasswordConfirmation ??
    record.deleteConfirmationPassword
  );
}

export function extractDeletePasswordFromRequest(request: Request) {
  const headerPassword = request.headers.get(DELETE_PASSWORD_HEADER);
  if (headerPassword) {
    return headerPassword;
  }

  try {
    return new URL(request.url).searchParams.get(DELETE_PASSWORD_FIELD);
  } catch {
    return undefined;
  }
}

export function deletePasswordRequiredResponse() {
  return NextResponse.json(
    {
      error:
        "DELETE password is required for destructive delete operations.",
      code: "DELETE_PASSWORD_REQUIRED",
      field: DELETE_PASSWORD_FIELD,
    },
    { status: 403 },
  );
}

export async function requireDeletePasswordFromRequest(request: Request) {
  return (await validateDeletePassword(extractDeletePasswordFromRequest(request)))
    ? null
    : deletePasswordRequiredResponse();
}

export async function requireDeletePasswordFromBodyOrRequest(
  body: unknown,
  request?: Request,
) {
  const bodyPassword = extractDeletePasswordFromBody(body);
  const requestPassword = request
    ? extractDeletePasswordFromRequest(request)
    : undefined;

  return (await validateDeletePassword(bodyPassword ?? requestPassword))
    ? null
    : deletePasswordRequiredResponse();
}

export async function requireDeletePasswordValue(value: unknown) {
  return (await validateDeletePassword(value))
    ? null
    : {
        field: DELETE_PASSWORD_FIELD,
        message:
          "DELETE password is required for destructive delete operations.",
        code: "DELETE_PASSWORD_REQUIRED",
      };
}

export function resetDeletePasswordCache() {
  cachedDeletePasswordHash = undefined;
  cachedDeletePasswordLoadedAt = 0;
}
