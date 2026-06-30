import { prisma } from "@/lib/platform/db";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";

export type AdminObjectLookupResult = {
  kind: string;
  id: string;
  title: string;
  detail: string;
  href: string | null;
  createdAt: string | null;
};

function formatDate(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function preview(value?: string | null) {
  const text = value?.trim();
  if (!text) return "No text";
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

export async function lookupAdminObjectById(actorUserId: string | undefined, query: string): Promise<{ canAccess: boolean; results: AdminObjectLookupResult[] }> {
  if (!(await isAdminUser(actorUserId))) {
    return { canAccess: false, results: [] };
  }

  const id = query.trim();
  if (!id || id.length < 6 || id.length > 140) {
    return { canAccess: true, results: [] };
  }

  const [
    feedPost,
    feedComment,
    marketListing,
    jobListing,
    adCampaign,
    chatThread,
    chatMessage,
    mailThread,
    mailMessage,
    groupForumThread,
    groupForumPost,
    mediaAsset,
    feedbackTicket
  ] = await Promise.all([
    prisma.feedPost.findUnique({ where: { id }, select: { id: true, body: true, createdAt: true } }),
    prisma.feedComment.findUnique({ where: { id }, select: { id: true, postId: true, body: true, createdAt: true } }),
    prisma.marketListing.findUnique({ where: { id }, select: { id: true, title: true, slug: true, status: true, createdAt: true } }),
    prisma.jobListing.findUnique({ where: { id }, select: { id: true, title: true, slug: true, status: true, createdAt: true } }),
    prisma.adCampaign.findUnique({ where: { id }, select: { id: true, title: true, placement: true, status: true, createdAt: true } }),
    prisma.chatThread.findUnique({ where: { id }, select: { id: true, title: true, type: true, createdAt: true } }),
    prisma.chatMessage.findUnique({ where: { id }, select: { id: true, threadId: true, body: true, createdAt: true } }),
    prisma.mailThread.findUnique({ where: { id }, select: { id: true, subject: true, deliveryKind: true, createdAt: true } }),
    prisma.mailMessage.findUnique({ where: { id }, select: { id: true, threadId: true, subject: true, createdAt: true } }),
    prisma.groupForumThread.findUnique({
      where: { id },
      select: { id: true, groupId: true, title: true, createdAt: true, group: { select: { slug: true } } }
    }),
    prisma.groupForumPost.findUnique({
      where: { id },
      select: { id: true, threadId: true, body: true, createdAt: true, thread: { select: { group: { select: { slug: true } } } } }
    }),
    prisma.mediaAsset.findUnique({ where: { id }, select: { id: true, originalName: true, mimeType: true, createdAt: true } }),
    prisma.feedbackTicket.findUnique({ where: { id }, select: { id: true, publicId: true, title: true, status: true, createdAt: true } })
  ]);

  const results: AdminObjectLookupResult[] = [];

  if (feedPost) {
    results.push({
      kind: "Post",
      id: feedPost.id,
      title: preview(feedPost.body),
      detail: "Stream post",
      href: `/posts/${feedPost.id}`,
      createdAt: formatDate(feedPost.createdAt)
    });
  }

  if (feedComment) {
    results.push({
      kind: "Comment",
      id: feedComment.id,
      title: preview(feedComment.body),
      detail: `Comment on post ${feedComment.postId}`,
      href: `/posts/${feedComment.postId}?comment=${feedComment.id}`,
      createdAt: formatDate(feedComment.createdAt)
    });
  }

  if (marketListing) {
    results.push({
      kind: "Market listing",
      id: marketListing.id,
      title: marketListing.title,
      detail: `Status: ${marketListing.status}`,
      href: `/market/${marketListing.slug}`,
      createdAt: formatDate(marketListing.createdAt)
    });
  }

  if (jobListing) {
    results.push({
      kind: "Job listing",
      id: jobListing.id,
      title: jobListing.title,
      detail: `Status: ${jobListing.status}`,
      href: `/market/jobs/${jobListing.slug}`,
      createdAt: formatDate(jobListing.createdAt)
    });
  }

  if (adCampaign) {
    results.push({
      kind: "Ad campaign",
      id: adCampaign.id,
      title: adCampaign.title,
      detail: `${adCampaign.placement} - ${adCampaign.status}`,
      href: "/ads",
      createdAt: formatDate(adCampaign.createdAt)
    });
  }

  if (chatThread) {
    results.push({
      kind: "Chat thread",
      id: chatThread.id,
      title: chatThread.title ?? chatThread.type,
      detail: `Thread type: ${chatThread.type}`,
      href: `/messages?thread=${chatThread.id}`,
      createdAt: formatDate(chatThread.createdAt)
    });
  }

  if (chatMessage) {
    results.push({
      kind: "Chat message",
      id: chatMessage.id,
      title: preview(chatMessage.body),
      detail: `Message in chat thread ${chatMessage.threadId}`,
      href: `/messages?thread=${chatMessage.threadId}`,
      createdAt: formatDate(chatMessage.createdAt)
    });
  }

  if (mailThread) {
    results.push({
      kind: "Mail thread",
      id: mailThread.id,
      title: mailThread.subject,
      detail: `Delivery: ${mailThread.deliveryKind}`,
      href: `/mail?thread=${mailThread.id}`,
      createdAt: formatDate(mailThread.createdAt)
    });
  }

  if (mailMessage) {
    results.push({
      kind: "Mail message",
      id: mailMessage.id,
      title: mailMessage.subject,
      detail: `Message in mail thread ${mailMessage.threadId}`,
      href: `/mail?thread=${mailMessage.threadId}`,
      createdAt: formatDate(mailMessage.createdAt)
    });
  }

  if (groupForumThread) {
    results.push({
      kind: "Group thread",
      id: groupForumThread.id,
      title: groupForumThread.title,
      detail: `Group ${groupForumThread.groupId}`,
      href: `/groups/${groupForumThread.group.slug}/forum/${groupForumThread.id}`,
      createdAt: formatDate(groupForumThread.createdAt)
    });
  }

  if (groupForumPost) {
    results.push({
      kind: "Group reply",
      id: groupForumPost.id,
      title: preview(groupForumPost.body),
      detail: `Reply in group thread ${groupForumPost.threadId}`,
      href: `/groups/${groupForumPost.thread.group.slug}/forum/${groupForumPost.threadId}`,
      createdAt: formatDate(groupForumPost.createdAt)
    });
  }

  if (mediaAsset) {
    results.push({
      kind: "Media asset",
      id: mediaAsset.id,
      title: mediaAsset.originalName ?? mediaAsset.mimeType,
      detail: mediaAsset.mimeType,
      href: "/gallery",
      createdAt: formatDate(mediaAsset.createdAt)
    });
  }

  if (feedbackTicket) {
    results.push({
      kind: "Report",
      id: feedbackTicket.id,
      title: `${feedbackTicket.publicId}: ${feedbackTicket.title}`,
      detail: `Status: ${feedbackTicket.status}`,
      href: "/admin/actions/reports-queue",
      createdAt: formatDate(feedbackTicket.createdAt)
    });
  }

  return { canAccess: true, results };
}
