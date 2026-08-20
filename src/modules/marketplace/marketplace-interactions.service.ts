import {
  MarketplaceInquiryStatus,
  MarketplaceInteractionStatus,
  MarketplaceListingStatus,
  MarketplaceReviewStatus,
  NotificationKind,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/platform/db";
import { findOrCreateDirectChatThread, sendChatMessage } from "@/modules/chat-messages/chat-messages.service";
import { marketplaceInquiryInputSchema, marketplaceReviewInputSchema } from "./marketplace.contracts";
import { requireMarketplaceActor } from "./marketplace-policy";
import { marketplaceListingInclude, toMarketplaceCardView } from "./marketplace-view";

function listingIsAvailable(listing: { status: MarketplaceListingStatus; expiresAt: Date | null }) {
  return (
    ([MarketplaceListingStatus.ACTIVE, MarketplaceListingStatus.RESERVED] as MarketplaceListingStatus[]).includes(listing.status) &&
    (!listing.expiresAt || listing.expiresAt.getTime() > Date.now())
  );
}

function marketplaceListingHref(slug: string) {
  return `/marketplace/${encodeURIComponent(slug)}`;
}

export async function setMarketplaceListingSaved(userId: string, listingId: string, saved: boolean) {
  const actor = await requireMarketplaceActor(userId, "interact");
  if (!actor.ok) return actor;
  return prisma.$transaction(async (transaction) => {
    const listing = await transaction.marketplaceListing.findUnique({
      where: { id: listingId },
      select: { id: true, status: true, expiresAt: true },
    });
    if (!listing || !listingIsAvailable(listing)) return { ok: false as const, error: "Listing not found." };
    const existing = await transaction.marketplaceSavedListing.findUnique({
      where: { userId_listingId: { userId, listingId } },
      select: { id: true },
    });
    if (saved && !existing) {
      await transaction.marketplaceSavedListing.create({ data: { userId, listingId } });
      await transaction.marketplaceListing.update({ where: { id: listingId }, data: { saveCount: { increment: 1 } } });
    } else if (!saved && existing) {
      await transaction.marketplaceSavedListing.delete({ where: { id: existing.id } });
      await transaction.marketplaceListing.update({ where: { id: listingId }, data: { saveCount: { decrement: 1 } } });
    }
    return { ok: true as const, saved };
  });
}

export async function listSavedMarketplaceListings(userId: string) {
  const actor = await requireMarketplaceActor(userId, "interact");
  if (!actor.ok) return actor;
  const saved = await prisma.marketplaceSavedListing.findMany({
    where: {
      userId,
      listing: {
        status: { in: [MarketplaceListingStatus.ACTIVE, MarketplaceListingStatus.RESERVED] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    },
    include: { listing: { include: marketplaceListingInclude } },
    orderBy: { createdAt: "desc" },
  });
  return { ok: true as const, items: saved.map((item) => toMarketplaceCardView(item.listing)) };
}

export async function createMarketplaceInquiry(userId: string, listingId: string, input: unknown) {
  const parsed = marketplaceInquiryInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Write a message." };
  const actor = await requireMarketplaceActor(userId, "interact");
  if (!actor.ok) return actor;
  const listing = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      slug: true,
      ownerUserId: true,
      title: true,
      summary: true,
      kind: true,
      intent: true,
      priceType: true,
      priceCents: true,
      priceMinCents: true,
      priceMaxCents: true,
      currency: true,
      city: true,
      region: true,
      countryCode: true,
      status: true,
      expiresAt: true,
      allowInAppMessages: true,
    },
  });
  if (!listing || !listingIsAvailable(listing)) return { ok: false as const, error: "Listing not found." };
  if (listing.ownerUserId === userId) return { ok: false as const, error: "You cannot inquire about your own listing." };
  if (!listing.allowInAppMessages) return { ok: false as const, error: "This publisher does not accept in-app messages for the listing." };

  const chat = await findOrCreateDirectChatThread(userId, { targetUserId: listing.ownerUserId });
  if (!chat.ok) return chat;
  const snapshot = {
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    summary: listing.summary,
    kind: listing.kind,
    intent: listing.intent,
    priceType: listing.priceType,
    priceCents: listing.priceCents,
    priceMinCents: listing.priceMinCents,
    priceMaxCents: listing.priceMaxCents,
    currency: listing.currency,
    city: listing.city,
    region: listing.region,
    countryCode: listing.countryCode,
  } satisfies Prisma.InputJsonObject;

  const inquiry = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.marketplaceInquiry.findUnique({
      where: { listingId_requesterUserId_kind: { listingId, requesterUserId: userId, kind: parsed.data.kind } },
    });
    if (existing) {
      const updated = existing.status === MarketplaceInquiryStatus.CLOSED
        ? await transaction.marketplaceInquiry.update({ where: { id: existing.id }, data: { status: MarketplaceInquiryStatus.OPEN, closedAt: null, threadId: chat.thread.id } })
        : existing;
      await transaction.marketplaceInteraction.upsert({
        where: { listingId_requesterUserId: { listingId, requesterUserId: userId } },
        create: { listingId, requesterUserId: userId, ownerUserId: listing.ownerUserId, inquiryId: updated.id },
        update: { inquiryId: updated.id },
      });
      return { record: updated, created: false };
    }
    const created = await transaction.marketplaceInquiry.create({
      data: {
        listingId,
        requesterUserId: userId,
        threadId: chat.thread.id,
        kind: parsed.data.kind,
        initialMessage: parsed.data.message,
        listingSnapshot: snapshot,
      },
    });
    await transaction.marketplaceInteraction.create({
      data: { listingId, inquiryId: created.id, requesterUserId: userId, ownerUserId: listing.ownerUserId },
    });
    await transaction.marketplaceListing.update({ where: { id: listingId }, data: { inquiryCount: { increment: 1 } } });
    return { record: created, created: true };
  });

  const body = `Marketplace inquiry: ${listing.title}\n${marketplaceListingHref(listing.slug)}\n\n${parsed.data.message}`.slice(0, 4_000);
  const message = await sendChatMessage(userId, { threadId: chat.thread.id, body, attachments: [] });
  if (!message.ok) {
    return { ok: true as const, inquiry: inquiry.record, threadId: chat.thread.id, messageSent: false as const, warning: message.error };
  }
  return { ok: true as const, inquiry: inquiry.record, threadId: chat.thread.id, messageSent: true as const };
}

export async function confirmMarketplaceInteraction(userId: string, interactionId: string) {
  const actor = await requireMarketplaceActor(userId, "interact");
  if (!actor.ok) return actor;
  return prisma.$transaction(async (transaction) => {
    const interaction = await transaction.marketplaceInteraction.findUnique({
      where: { id: interactionId },
      include: { listing: { select: { slug: true, title: true } } },
    });
    if (!interaction || ![interaction.ownerUserId, interaction.requesterUserId].includes(userId)) {
      return { ok: false as const, error: "Interaction not found." };
    }
    if (interaction.status !== MarketplaceInteractionStatus.OPEN) {
      return interaction.status === MarketplaceInteractionStatus.COMPLETED
        ? { ok: true as const, interaction }
        : { ok: false as const, error: "This interaction can no longer be completed." };
    }
    const now = new Date();
    const requesterConfirmedAt = userId === interaction.requesterUserId ? now : interaction.requesterConfirmedAt;
    const ownerConfirmedAt = userId === interaction.ownerUserId ? now : interaction.ownerConfirmedAt;
    const completed = Boolean(requesterConfirmedAt && ownerConfirmedAt);
    const updated = await transaction.marketplaceInteraction.update({
      where: { id: interaction.id },
      data: {
        requesterConfirmedAt,
        ownerConfirmedAt,
        status: completed ? MarketplaceInteractionStatus.COMPLETED : MarketplaceInteractionStatus.OPEN,
        completedAt: completed ? now : null,
      },
    });
    if (completed) {
      const recipientUserId = userId === interaction.ownerUserId ? interaction.requesterUserId : interaction.ownerUserId;
      await transaction.notification.create({
        data: {
          userId: recipientUserId,
          kind: NotificationKind.GENERAL,
          sourceType: "MarketplaceInteraction",
          sourceId: interaction.id,
          title: "Marketplace exchange confirmed",
          body: `You can now review your interaction for ${interaction.listing.title}.`,
          href: marketplaceListingHref(interaction.listing.slug),
        },
      });
    }
    return { ok: true as const, interaction: updated };
  });
}

export async function cancelMarketplaceInteraction(userId: string, interactionId: string) {
  const actor = await requireMarketplaceActor(userId, "interact");
  if (!actor.ok) return actor;
  const interaction = await prisma.marketplaceInteraction.findUnique({ where: { id: interactionId } });
  if (!interaction || ![interaction.ownerUserId, interaction.requesterUserId].includes(userId)) {
    return { ok: false as const, error: "Interaction not found." };
  }
  if (interaction.status !== MarketplaceInteractionStatus.OPEN) return { ok: false as const, error: "This interaction cannot be canceled." };
  const updated = await prisma.marketplaceInteraction.update({
    where: { id: interaction.id },
    data: { status: MarketplaceInteractionStatus.CANCELED, canceledAt: new Date() },
  });
  return { ok: true as const, interaction: updated };
}

export async function reviewMarketplaceInteraction(userId: string, interactionId: string, input: unknown) {
  const parsed = marketplaceReviewInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the review." };
  const actor = await requireMarketplaceActor(userId, "interact");
  if (!actor.ok) return actor;
  const interaction = await prisma.marketplaceInteraction.findUnique({
    where: { id: interactionId },
    include: { listing: { select: { slug: true, title: true } } },
  });
  if (!interaction || ![interaction.ownerUserId, interaction.requesterUserId].includes(userId)) {
    return { ok: false as const, error: "Interaction not found." };
  }
  if (interaction.status !== MarketplaceInteractionStatus.COMPLETED || !interaction.completedAt) {
    return { ok: false as const, error: "Both people must confirm the exchange before either can leave a review." };
  }
  const subjectUserId = userId === interaction.ownerUserId ? interaction.requesterUserId : interaction.ownerUserId;
  try {
    const review = await prisma.$transaction(async (transaction) => {
      const created = await transaction.marketplaceReview.create({
        data: {
          interactionId,
          listingId: interaction.listingId,
          authorUserId: userId,
          subjectUserId,
          rating: parsed.data.rating,
          body: parsed.data.body || null,
          status: MarketplaceReviewStatus.PUBLISHED,
        },
      });
      await transaction.notification.create({
        data: {
          userId: subjectUserId,
          kind: NotificationKind.GENERAL,
          sourceType: "MarketplaceReview",
          sourceId: created.id,
          title: "You received a marketplace review",
          body: `A completed interaction for ${interaction.listing.title} was reviewed.`,
          href: marketplaceListingHref(interaction.listing.slug),
        },
      });
      return created;
    });
    return { ok: true as const, review };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false as const, error: "You already reviewed this interaction." };
    }
    throw error;
  }
}

export async function listMarketplaceInteractions(userId: string) {
  const actor = await requireMarketplaceActor(userId, "interact");
  if (!actor.ok) return actor;
  const interactions = await prisma.marketplaceInteraction.findMany({
    where: { OR: [{ ownerUserId: userId }, { requesterUserId: userId }] },
    include: {
      listing: { select: { id: true, slug: true, title: true, kind: true, status: true } },
      reviews: { where: { authorUserId: userId }, select: { id: true, rating: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return { ok: true as const, interactions };
}
