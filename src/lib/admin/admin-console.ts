import { prisma } from "@/lib/db/prisma";
import { sendAdminAnnouncementEmail } from "@/lib/email/smtp";
import { logAdminAction } from "@/lib/auth/admin";

type AnnouncementDeliveryMode = "BANNER" | "POPUP_FIRST_LOGIN" | "POPUP_REALTIME" | "EMAIL" | "AD_STREAM";

type AnnouncementAudience = Readonly<{
  sendToSite: boolean;
  sendToGroups: boolean;
  sendToTiers: boolean;
  groupIds: string[];
  tierValues: string[];
}>;

export type MonthlyFinancialReportRow = Readonly<{
  monthKey: string;
  monthLabel: string;
  newAccounts: number;
  plusSignups: number;
  proSignups: number;
  auditorSignups: number;
  estimatedRevenueCents: number;
  adSpendCredits: number;
  adGrantCredits: number;
}>;

const TIER_PRICE_CENTS: Record<string, number> = {
  CONTRIBUTOR: 300,
  PRO: 1000,
  AUDITOR: 1000,
};

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 0, 0, 0, 0);
}

function isWithinMonth(value: Date, start: Date, end: Date) {
  const time = value.getTime();
  return time >= start.getTime() && time < end.getTime();
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
}

export async function resolveMonthlyFinancialReports(monthCount = 6): Promise<MonthlyFinancialReportRow[]> {
  const now = new Date();
  const months = Array.from({ length: Math.max(1, monthCount) }, (_, index) => {
    const start = startOfMonth(addMonths(now, -(Math.max(1, monthCount) - 1 - index)));
    const end = addMonths(start, 1);
    return { start, end };
  });

  const [users, billingSubscriptions, adLedgerEntries] = await Promise.all([
    prisma.user.findMany({
      select: { createdAt: true, subscriptionTier: true, role: true },
    }),
    prisma.billingSubscription.findMany({
      select: { createdAt: true, subscriptionTier: true, status: true },
    }),
    prisma.adCreditLedger.findMany({
      select: { createdAt: true, entryType: true, credits: true },
    }),
  ]);

  return months.map(({ start, end }) => {
    const monthUsers = users.filter((user) => isWithinMonth(user.createdAt, start, end));
    const monthSubscriptions = billingSubscriptions.filter((row) => isWithinMonth(row.createdAt, start, end));
    const monthLedger = adLedgerEntries.filter((row) => isWithinMonth(row.createdAt, start, end));

    const plusSignups = monthSubscriptions.filter((row) => row.subscriptionTier === "CONTRIBUTOR" && row.status !== "INACTIVE").length;
    const proSignups = monthSubscriptions.filter((row) => row.subscriptionTier === "PRO" && row.status !== "INACTIVE").length;
    const auditorSignups = monthSubscriptions.filter((row) => row.subscriptionTier === "AUDITOR" && row.status !== "INACTIVE").length;
    const estimatedRevenueCents =
      plusSignups * TIER_PRICE_CENTS.CONTRIBUTOR +
      proSignups * TIER_PRICE_CENTS.PRO +
      auditorSignups * TIER_PRICE_CENTS.AUDITOR;
    const adSpendCredits = Math.abs(monthLedger.filter((row) => row.entryType === "AD_SPEND" && row.credits < 0).reduce((sum, row) => sum + row.credits, 0));
    const adGrantCredits = monthLedger.filter((row) => row.entryType === "MONTHLY_GRANT" && row.credits > 0).reduce((sum, row) => sum + row.credits, 0);

    return {
      monthKey: start.toISOString().slice(0, 7),
      monthLabel: formatMonthLabel(start),
      newAccounts: monthUsers.length,
      plusSignups,
      proSignups,
      auditorSignups,
      estimatedRevenueCents,
      adSpendCredits,
      adGrantCredits,
    };
  });
}

async function resolveAnnouncementRecipients(input: AnnouncementAudience) {
  const recipientIds = new Set<string>();

  if (input.sendToSite) {
    const allUsers = await prisma.user.findMany({
      where: { deactivatedAt: null, deletionRequestedAt: null },
      select: { id: true },
    });
    allUsers.forEach((user) => recipientIds.add(user.id));
  }

  if (input.sendToGroups && input.groupIds.length > 0) {
    const memberships = await prisma.groupMember.findMany({
      where: { groupId: { in: input.groupIds } },
      select: { userId: true },
    });
    memberships.forEach((membership) => recipientIds.add(membership.userId));
  }

  if (input.sendToTiers && input.tierValues.length > 0) {
    const tierUsers = await prisma.user.findMany({
      where: {
        subscriptionTier: { in: input.tierValues },
        deactivatedAt: null,
        deletionRequestedAt: null,
      },
      select: { id: true },
    });
    tierUsers.forEach((user) => recipientIds.add(user.id));
  }

  if (!input.sendToSite && !input.sendToGroups && !input.sendToTiers) {
    const allUsers = await prisma.user.findMany({
      where: { deactivatedAt: null, deletionRequestedAt: null },
      select: { id: true },
    });
    allUsers.forEach((user) => recipientIds.add(user.id));
  }

  return Array.from(recipientIds);
}

export async function dispatchAdminAnnouncement(input: {
  actorUserId: string;
  headline: string;
  body: string;
  targetUrl: string | null;
  deliveryModes: AnnouncementDeliveryMode[];
  sendToSite: boolean;
  sendToGroups: boolean;
  sendToTiers: boolean;
  groupIds: string[];
  tierValues: string[];
  adSpendCredits: number;
  adBoostFactor: number;
}) {
  const recipients = await resolveAnnouncementRecipients({
    sendToSite: input.sendToSite,
    sendToGroups: input.sendToGroups,
    sendToTiers: input.sendToTiers,
    groupIds: input.groupIds,
    tierValues: input.tierValues,
  });
  const sendNotification = input.deliveryModes.some((mode) => mode === "BANNER" || mode === "POPUP_FIRST_LOGIN" || mode === "POPUP_REALTIME");
  const sendEmail = input.deliveryModes.includes("EMAIL");
  const sendAd = input.deliveryModes.includes("AD_STREAM");

  let notificationCount = 0;
  let emailCount = 0;
  let adPlacementId: string | null = null;

  if (sendNotification && recipients.length > 0) {
    await prisma.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        type: "ADMIN_ANNOUNCEMENT",
        body: input.body,
        targetUrl: input.targetUrl || "/notifications",
      })),
    });
    notificationCount = recipients.length;
  }

  if (sendEmail && recipients.length > 0) {
    const recipientRows = await prisma.user.findMany({
      where: { id: { in: recipients } },
      select: { email: true },
    });
    for (const recipient of recipientRows) {
      try {
        await sendAdminAnnouncementEmail({
          to: recipient.email,
          headline: input.headline,
          body: input.body,
          link: input.targetUrl || null,
        });
        emailCount += 1;
      } catch (error) {
        console.error("[admin console] announcement email failed", {
          to: recipient.email,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (sendAd) {
    const ad = await prisma.adPlacement.create({
      data: {
        creatorId: input.actorUserId,
        targetType: "SITE_ANNOUNCEMENT",
        headline: input.headline,
        body: input.body,
        creditCost: Math.max(0, Math.trunc(input.adSpendCredits)),
        boostFactor: Math.max(1, input.adBoostFactor),
        status: "ACTIVE",
      },
      select: { id: true },
    });
    adPlacementId = ad.id;
  }

  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "CREATE_ANNOUNCEMENT",
    targetType: "ANNOUNCEMENT",
    targetId: adPlacementId ?? input.headline.slice(0, 60),
    note: JSON.stringify({
      headline: input.headline,
      deliveryModes: input.deliveryModes,
      sendToSite: input.sendToSite,
      sendToGroups: input.sendToGroups,
      sendToTiers: input.sendToTiers,
      groupIds: input.groupIds,
      tierValues: input.tierValues,
      notificationCount,
      emailCount,
      adPlacementId,
    }),
  });

  return {
    recipientCount: recipients.length,
    notificationCount,
    emailCount,
    adPlacementId,
  };
}

export async function restoreUserAccount(input: { actorUserId: string; userId: string }) {
  const updated = await prisma.user.update({
    where: { id: input.userId },
    data: {
      deactivatedAt: null,
      deletionRequestedAt: null,
      sessionVersion: { increment: 1 },
    },
    select: { id: true, email: true, username: true },
  });

  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "RESTORE_USER_ACCOUNT",
    targetType: "USER",
    targetId: updated.id,
    note: updated.username ?? updated.email,
  });

  return updated;
}

export async function adjustUserAdCredits(input: { actorUserId: string; userId: string; credits: number; note?: string | null }) {
  const currentBalance = await prisma.adCreditLedger.aggregate({
    where: { userId: input.userId },
    _sum: { credits: true },
  });
  const credits = Math.trunc(input.credits);
  if (!credits) return null;

  const entry = await prisma.adCreditLedger.create({
    data: {
      ledgerKey: `ADMIN_ADJUSTMENT:${input.userId}:${Date.now()}`,
      userId: input.userId,
      entryType: "ADMIN_ADJUSTMENT",
      credits,
      balanceAfter: (currentBalance._sum.credits ?? 0) + credits,
      sourceType: "ADMIN",
      sourceId: input.actorUserId,
      note: input.note ?? null,
    },
    select: { id: true },
  });

  await logAdminAction({
    actorUserId: input.actorUserId,
    action: credits > 0 ? "ADD_AD_CREDITS" : "REMOVE_AD_CREDITS",
    targetType: "USER",
    targetId: input.userId,
    note: input.note ?? `${credits} credits`,
  });

  return entry;
}

export async function setAdBoostFactor(input: { actorUserId: string; adPlacementId: string; boostFactor: number; note?: string | null }) {
  const boostFactor = Math.max(1, input.boostFactor);
  const updated = await prisma.adPlacement.update({
    where: { id: input.adPlacementId },
    data: { boostFactor },
    select: { id: true, headline: true },
  });

  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "SET_AD_BOOST",
    targetType: "AD_PLACEMENT",
    targetId: updated.id,
    note: input.note ?? `${updated.headline} x${boostFactor.toFixed(2)}`,
  });

  return updated;
}

export async function boostAdsForCreator(input: { actorUserId: string; creatorId: string; boostFactor: number }) {
  const boostFactor = Math.max(1, input.boostFactor);
  const updated = await prisma.adPlacement.updateMany({
    where: { creatorId: input.creatorId },
    data: { boostFactor },
  });

  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "BOOST_ADS_FOR_ACCOUNT",
    targetType: "USER",
    targetId: input.creatorId,
    note: `x${boostFactor.toFixed(2)} for ${updated.count} ads`,
  });

  return updated.count;
}
