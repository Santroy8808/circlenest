export type BusinessStorefrontInquirySummary = Readonly<{
  id: string;
  businessProfileId: string;
  visitorName: string;
  visitorEmail: string;
  visitorMessage: string;
  readAt: string | null;
  createdAt: string;
}>;

type BusinessStorefrontInquirySource = {
  id: string;
  businessProfileId: string;
  visitorName: string;
  visitorEmail: string;
  visitorMessage: string;
  readAt: Date | string | null;
  createdAt: Date | string;
};

export function normalizeStorefrontSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function ensureUniqueStorefrontSlug(
  baseSlug: string,
  isTaken: (slug: string) => Promise<boolean>,
) {
  const rootSlug = normalizeStorefrontSlug(baseSlug) || "storefront";
  let candidate = rootSlug;
  for (let index = 2; await isTaken(candidate); index += 1) {
    candidate = `${rootSlug}-${index}`;
  }
  return candidate;
}

function normalizeDate(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeRequiredDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function serializeBusinessStorefrontInquiry(inquiry: BusinessStorefrontInquirySource): BusinessStorefrontInquirySummary {
  return {
    id: inquiry.id,
    businessProfileId: inquiry.businessProfileId,
    visitorName: inquiry.visitorName,
    visitorEmail: inquiry.visitorEmail,
    visitorMessage: inquiry.visitorMessage,
    readAt: normalizeDate(inquiry.readAt),
    createdAt: normalizeRequiredDate(inquiry.createdAt),
  };
}

export function serializeBusinessStorefrontInquiries(inquiries: BusinessStorefrontInquirySource[]): BusinessStorefrontInquirySummary[] {
  return inquiries.map((inquiry) => serializeBusinessStorefrontInquiry(inquiry));
}
