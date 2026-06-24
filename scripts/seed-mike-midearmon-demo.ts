import {
  AdCampaignStatus,
  AdDestinationKind,
  AdPlacement,
  ChatThreadType,
  EventInvitationStatus,
  EventModeratorRole,
  EventRsvpStatus,
  EventStatus,
  FeedReactionType,
  FeedVisibility,
  FundraiserCategory,
  FundraiserStatus,
  GroupForumReactionType,
  GroupJoinPolicy,
  GroupMemberRole,
  GroupVisibility,
  JobCategory,
  JobEmploymentType,
  JobListingStatus,
  MailDeliveryKind,
  MailRecipientType,
  MarketListingCategory,
  MarketListingStatus,
  MediaVisibility,
  MembershipTier,
  PrismaClient,
  ProfileVisibility,
  ScientologyClassification,
  ScientologyVisibility,
  SocialRelationshipType,
  UserRole
} from "@prisma/client";
import { hashPassword } from "../src/modules/auth-security/password";

const prisma = new PrismaClient();
const password = "Pa$$werd13";
const now = new Date();

function daysAgo(days: number, minutes = 0) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000 - minutes * 60 * 1000);
}

function daysFromNow(days: number, minutes = 0) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000 + minutes * 60 * 1000);
}

function imageUrl(seed: string, width = 900, height = 620) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`;
}

async function ensureUser(input: {
  email: string;
  username: string;
  displayName: string;
  tier: MembershipTier;
  role?: UserRole;
  location: string;
  tagline: string;
}) {
  const passwordHash = await hashPassword(password);
  const existing =
    (await prisma.user.findUnique({ where: { username: input.username } })) ??
    (await prisma.user.findUnique({ where: { email: input.email } }));
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          email: input.email,
          username: input.username,
          emailVerified: now,
          deactivatedAt: null,
          onboardingCompletedAt: now,
          termsAcceptedAt: now
        }
      })
    : await prisma.user.create({
        data: {
          email: input.email,
          username: input.username,
          passwordHash,
          role: input.role ?? UserRole.MEMBER,
          emailVerified: now,
          lastPasswordChangedAt: now,
          onboardingCompletedAt: now,
          termsAcceptedAt: now
        }
      });

  await prisma.profile.upsert({
    where: { userId: user.id },
    update: {
      displayName: input.displayName,
      tagline: input.tagline,
      bio: `${input.displayName} demo profile with active messages, mail, groups, events, Market listings, and Production Zone data.`,
      location: input.location,
      visibility: ProfileVisibility.MEMBERS,
      avatarUrl: imageUrl(`${input.username}-avatar`, 320, 320),
      bannerUrl: imageUrl(`${input.username}-banner`, 1280, 420)
    },
    create: {
      userId: user.id,
      displayName: input.displayName,
      tagline: input.tagline,
      bio: `${input.displayName} demo profile with active messages, mail, groups, events, Market listings, and Production Zone data.`,
      location: input.location,
      visibility: ProfileVisibility.MEMBERS,
      avatarUrl: imageUrl(`${input.username}-avatar`, 320, 320),
      bannerUrl: imageUrl(`${input.username}-banner`, 1280, 420)
    }
  });

  await prisma.membership.upsert({
    where: { userId: user.id },
    update: {
      tier: input.tier,
      platformCredits: input.tier === MembershipTier.PROFESSIONAL ? 150 : 25,
      storageLimitBytes: BigInt(input.tier === MembershipTier.PROFESSIONAL ? 2_147_483_648 : 536_870_912)
    },
    create: {
      userId: user.id,
      tier: input.tier,
      platformCredits: input.tier === MembershipTier.PROFESSIONAL ? 150 : 25,
      storageLimitBytes: BigInt(input.tier === MembershipTier.PROFESSIONAL ? 2_147_483_648 : 536_870_912)
    }
  });

  await prisma.scientologyProfile.upsert({
    where: { userId: user.id },
    update: {
      classification: input.username === "midearmon" ? ScientologyClassification.PUBLIC : ScientologyClassification.STAFF,
      orgName: input.username === "midearmon" ? "Austin Org" : "Dallas Org",
      lastServiceName: "Course room",
      lastServiceAt: daysAgo(18),
      trainingLevel: input.username === "midearmon" ? "Class IV Auditor" : "Student Hat",
      processingStatus: input.username === "midearmon" ? "Clear" : "Purification Rundown",
      goodStandingAttested: true,
      goodStandingUpdatedAt: now,
      visibility: ScientologyVisibility.MEMBERS
    },
    create: {
      userId: user.id,
      classification: input.username === "midearmon" ? ScientologyClassification.PUBLIC : ScientologyClassification.STAFF,
      orgName: input.username === "midearmon" ? "Austin Org" : "Dallas Org",
      lastServiceName: "Course room",
      lastServiceAt: daysAgo(18),
      trainingLevel: input.username === "midearmon" ? "Class IV Auditor" : "Student Hat",
      processingStatus: input.username === "midearmon" ? "Clear" : "Purification Rundown",
      goodStandingAttested: true,
      goodStandingUpdatedAt: now,
      visibility: ScientologyVisibility.MEMBERS
    }
  });

  return user;
}

async function createMedia(ownerUserId: string, seed: string, visibility: MediaVisibility = MediaVisibility.MEMBERS) {
  return prisma.mediaAsset.upsert({
    where: { storageKey: `theta-demo/${ownerUserId}/${seed}.jpg` },
    update: {
      publicUrl: imageUrl(seed),
      visibility
    },
    create: {
      ownerUserId,
      storageKey: `theta-demo/${ownerUserId}/${seed}.jpg`,
      publicUrl: imageUrl(seed),
      mimeType: "image/jpeg",
      sizeBytes: BigInt(420_000),
      originalName: `${seed}.jpg`,
      visibility,
      metadata: { demo: true, seed }
    }
  });
}

async function cleanup(userIds: string[]) {
  await prisma.mailThread.deleteMany({ where: { subject: { startsWith: "[Theta demo]" } } });
  await prisma.chatThread.deleteMany({ where: { title: { startsWith: "Theta demo" } } });
  await prisma.event.deleteMany({ where: { slug: { startsWith: "theta-demo-" } } });
  await prisma.group.deleteMany({ where: { slug: { startsWith: "theta-demo-" } } });
  await prisma.fundraiserCampaign.deleteMany({ where: { slug: { startsWith: "theta-demo-" } } });
  await prisma.writerManuscript.deleteMany({ where: { slug: { startsWith: "theta-demo-" } } });
  await prisma.jobListing.deleteMany({ where: { slug: { startsWith: "theta-demo-" } } });
  await prisma.marketListing.deleteMany({ where: { slug: { startsWith: "theta-demo-" } } });
  await prisma.businessArticle.deleteMany({ where: { slug: { startsWith: "theta-demo-" } } });
  await prisma.adCampaign.deleteMany({ where: { title: { startsWith: "[Theta demo]" } } });
  await prisma.feedPost.deleteMany({
    where: {
      authorUserId: { in: userIds },
      body: { contains: "[Theta demo]" }
    }
  });
}

async function main() {
  const midearmon = await ensureUser({
    email: "midearmon@theta-space.net",
    username: "midearmon",
    displayName: "Michael De Armon",
    tier: MembershipTier.PROFESSIONAL,
    role: UserRole.ADMIN,
    location: "Austin, TX",
    tagline: "Building Theta-Space into a clean private social platform."
  });
  const mike = await ensureUser({
    email: "mike@theta-space.net",
    username: "mike",
    displayName: "Mike",
    tier: MembershipTier.CONTRIBUTOR,
    location: "Dallas, TX",
    tagline: "Demo member for testing the daily-use loop."
  });
  const jules = await ensureUser({
    email: "jules@theta-space.net",
    username: "jules",
    displayName: "Jules",
    tier: MembershipTier.FREE,
    location: "Clearwater, FL",
    tagline: "Friend and family demo account."
  });

  await cleanup([midearmon.id, mike.id, jules.id]);

  const [mikePhoto, businessPhoto] = await Promise.all([
    createMedia(mike.id, "mike-stream-win"),
    createMedia(midearmon.id, "theta-demo-business-feature", MediaVisibility.PUBLIC)
  ]);

  await prisma.socialRelationship.createMany({
    data: [
      { fromUserId: midearmon.id, toUserId: mike.id, type: SocialRelationshipType.FRIEND, note: "Theta demo friend" },
      { fromUserId: mike.id, toUserId: midearmon.id, type: SocialRelationshipType.FRIEND, note: "Theta demo friend" },
      { fromUserId: midearmon.id, toUserId: jules.id, type: SocialRelationshipType.FAMILY, note: "Spouse" },
      { fromUserId: jules.id, toUserId: midearmon.id, type: SocialRelationshipType.FAMILY, note: "Spouse" },
      { fromUserId: mike.id, toUserId: jules.id, type: SocialRelationshipType.CONTACT, note: "Mail contact" },
      { fromUserId: jules.id, toUserId: mike.id, type: SocialRelationshipType.CONTACT, note: "Mail contact" }
    ],
    skipDuplicates: true
  });

  const post = await prisma.feedPost.create({
    data: {
      authorUserId: midearmon.id,
      body: "[Theta demo] Testing the main stream loop: post, reply, reaction, notification, and return.",
      visibility: FeedVisibility.MEMBERS,
      mediaAssetId: businessPhoto.id,
      createdAt: daysAgo(1)
    }
  });
  const comment = await prisma.feedComment.create({
    data: {
      postId: post.id,
      authorUserId: mike.id,
      body: "This is the kind of compact thread I want to click into and test.",
      mediaAssetId: mikePhoto.id,
      createdAt: daysAgo(1, 20)
    }
  });
  await prisma.feedComment.create({
    data: {
      postId: post.id,
      parentCommentId: comment.id,
      authorUserId: jules.id,
      body: "Nested reply for thread expansion testing.",
      createdAt: daysAgo(1, 15)
    }
  });
  await prisma.feedPostReaction.createMany({
    data: [
      { postId: post.id, userId: mike.id, type: FeedReactionType.LIKE },
      { postId: post.id, userId: jules.id, type: FeedReactionType.LOVE }
    ],
    skipDuplicates: true
  });

  const group = await prisma.group.create({
    data: {
      slug: "theta-demo-field-group",
      name: "Theta Demo Field Group",
      tagline: "A small group with members, forum threads, and files.",
      description: "Seeded group for clicking through joined groups, members, threads, and group profile data.",
      visibility: GroupVisibility.PUBLIC,
      joinPolicy: GroupJoinPolicy.OPEN,
      createdByUserId: midearmon.id,
      avatarUrl: imageUrl("theta-demo-group-avatar", 320, 320),
      bannerUrl: imageUrl("theta-demo-group-banner", 1280, 420)
    }
  });
  await prisma.groupMember.createMany({
    data: [
      { groupId: group.id, userId: midearmon.id, role: GroupMemberRole.OWNER },
      { groupId: group.id, userId: mike.id, role: GroupMemberRole.MODERATOR },
      { groupId: group.id, userId: jules.id, role: GroupMemberRole.MEMBER }
    ],
    skipDuplicates: true
  });
  const thread = await prisma.groupForumThread.create({
    data: {
      groupId: group.id,
      authorUserId: midearmon.id,
      title: "Demo thread with replies",
      body: "Use this to check collapsed thread cards and full vertical thread view.",
      allowPhotoReplies: true
    }
  });
  const forumPost = await prisma.groupForumPost.create({
    data: {
      threadId: thread.id,
      authorUserId: mike.id,
      body: "First forum reply from Mike."
    }
  });
  await prisma.groupForumPost.create({
    data: {
      threadId: thread.id,
      parentPostId: forumPost.id,
      authorUserId: jules.id,
      body: "Nested group reply for layer expansion."
    }
  });
  await prisma.groupForumThreadReaction.create({
    data: { threadId: thread.id, userId: mike.id, type: GroupForumReactionType.LIKE }
  });

  const business = await prisma.businessProfile.upsert({
    where: { ownerUserId: midearmon.id },
    update: {
      slug: "theta-demo-studio",
      businessName: "Theta Demo Studio",
      tagline: "Clean member-focused platform demos.",
      description: "Seeded storefront with an inquiry path, listing, blog, and active ad campaign.",
      location: "Austin, TX",
      publicEmail: "midearmon@theta-space.net",
      website: "https://theta-space.net",
      logoUrl: imageUrl("theta-demo-studio-logo", 320, 320),
      bannerUrl: imageUrl("theta-demo-studio-banner", 1280, 420),
      heroImageUrl: imageUrl("theta-demo-studio-hero", 1000, 650),
      publicStorefrontEnabled: true,
      blogEnabled: true
    },
    create: {
      ownerUserId: midearmon.id,
      slug: "theta-demo-studio",
      businessName: "Theta Demo Studio",
      tagline: "Clean member-focused platform demos.",
      description: "Seeded storefront with an inquiry path, listing, blog, and active ad campaign.",
      location: "Austin, TX",
      publicEmail: "midearmon@theta-space.net",
      website: "https://theta-space.net",
      logoUrl: imageUrl("theta-demo-studio-logo", 320, 320),
      bannerUrl: imageUrl("theta-demo-studio-banner", 1280, 420),
      heroImageUrl: imageUrl("theta-demo-studio-hero", 1000, 650),
      publicStorefrontEnabled: true,
      blogEnabled: true
    }
  });
  const article = await prisma.businessArticle.create({
    data: {
      ownerUserId: midearmon.id,
      businessProfileId: business.id,
      slug: "theta-demo-business-article",
      title: "How we demo a clean member flow",
      summary: "A storefront article available from the business profile.",
      body: "This seeded article gives the storefront blog tab real content for QC.",
      published: true
    }
  });
  const listing = await prisma.marketListing.create({
    data: {
      sellerUserId: midearmon.id,
      slug: "theta-demo-market-listing",
      title: "Demo Course Supply Kit",
      description: "A square Market listing with thumbnail, title, location, price, and detail page.",
      category: MarketListingCategory.COURSE_SUPPLIES,
      location: "Austin, TX",
      priceCents: 4900,
      status: MarketListingStatus.ACTIVE,
      expiresAt: daysFromNow(14)
    }
  });
  await prisma.marketListingPhoto.create({
    data: { listingId: listing.id, mediaAssetId: businessPhoto.id }
  });
  await prisma.jobListing.create({
    data: {
      employerUserId: midearmon.id,
      slug: "theta-demo-job-listing",
      title: "Demo Production Assistant",
      companyName: "Theta Demo Studio",
      summary: "Clickable job card seeded for the job board.",
      description: "This job demonstrates the full detail/contact view and Professional-only creation path.",
      category: JobCategory.CREATIVE,
      employmentType: JobEmploymentType.CONTRACT,
      location: "Austin, TX",
      remote: true,
      compensation: "$30-$40/hr",
      contactEmail: "midearmon@theta-space.net",
      contactInstructions: "Send an internal mail with availability.",
      status: JobListingStatus.ACTIVE
    }
  });
  const event = await prisma.event.create({
    data: {
      slug: "theta-demo-production-event",
      title: "Theta Demo Production Night",
      summary: "Seeded event with invite, RSVP, and moderator records.",
      description: "Use this to test Production Zone events and invitation visibility.",
      locationName: "Austin Org Hall",
      address: "100 Demo Way, Austin, TX",
      startsAt: daysFromNow(10),
      endsAt: daysFromNow(10, 180),
      status: EventStatus.PUBLISHED,
      createdByUserId: midearmon.id
    }
  });
  await prisma.eventModerator.createMany({
    data: [
      { eventId: event.id, userId: midearmon.id, role: EventModeratorRole.OWNER },
      { eventId: event.id, userId: mike.id, role: EventModeratorRole.MODERATOR }
    ],
    skipDuplicates: true
  });
  await prisma.eventInvitation.createMany({
    data: [
      { eventId: event.id, inviteeUserId: mike.id, invitedByUserId: midearmon.id, status: EventInvitationStatus.ACCEPTED },
      { eventId: event.id, inviteeUserId: jules.id, invitedByUserId: midearmon.id, status: EventInvitationStatus.PENDING }
    ],
    skipDuplicates: true
  });
  await prisma.eventRsvp.create({
    data: { eventId: event.id, userId: mike.id, status: EventRsvpStatus.GOING }
  });
  await prisma.adCampaign.create({
    data: {
      ownerUserId: midearmon.id,
      businessProfileId: business.id,
      marketListingId: listing.id,
      imageMediaAssetId: businessPhoto.id,
      title: "[Theta demo] Course Supply Kit ad",
      body: "Clickable ad that lands on the Market listing.",
      destinationKind: AdDestinationKind.MARKET_LISTING,
      destinationUrl: `/market/${listing.slug}`,
      placement: AdPlacement.RIGHT_STREAM,
      status: AdCampaignStatus.ACTIVE,
      totalBudgetCredits: 25,
      dailyBudgetCredits: 5,
      startsAt: daysAgo(1),
      endsAt: daysFromNow(12)
    }
  });
  await prisma.fundraiserCampaign.create({
    data: {
      creatorUserId: midearmon.id,
      slug: "theta-demo-fundraiser",
      title: "Demo Study Materials Fund",
      summary: "Seeded fundraiser for Production Zone browsing.",
      description: "A live-looking fundraiser campaign with a goal and end date.",
      category: FundraiserCategory.MATERIALS_SUPPLIES,
      goalAmountCents: 125000,
      status: FundraiserStatus.ACTIVE,
      endsAt: daysFromNow(28)
    }
  });
  const manuscript = await prisma.writerManuscript.create({
    data: {
      authorUserId: midearmon.id,
      slug: "theta-demo-manuscript",
      title: "Demo Notes From The Field",
      genre: "Field Notes",
      summary: "Seeded manuscript with a chapter for Writers Corner.",
      publishToStorefront: true
    }
  });
  await prisma.writerChapter.create({
    data: {
      manuscriptId: manuscript.id,
      title: "Opening Demo Chapter",
      bodyText: "This chapter exists so Writers Corner has something real to open and read.",
      bodyHtml: "<p>This chapter exists so Writers Corner has something real to open and read.</p>",
      wordCount: 15,
      sortOrder: 1,
      publishedAt: now,
      autosavedAt: now
    }
  });

  const mailThread = await prisma.mailThread.create({
    data: {
      subject: "[Theta demo] Mail thread between Mike and Midearmon",
      deliveryKind: MailDeliveryKind.DIRECT,
      createdByUserId: midearmon.id,
      lastMessageAt: daysAgo(0, 35)
    }
  });
  const mailMessage = await prisma.mailMessage.create({
    data: {
      threadId: mailThread.id,
      senderUserId: midearmon.id,
      subject: mailThread.subject,
      bodyText: "This mail verifies contacts, inbox, sent mail, and notification flow.",
      createdAt: daysAgo(0, 35)
    }
  });
  await prisma.mailRecipient.createMany({
    data: [
      { messageId: mailMessage.id, userId: mike.id, type: MailRecipientType.TO, readAt: null },
      { messageId: mailMessage.id, userId: midearmon.id, type: MailRecipientType.TO, readAt: daysAgo(0, 30) }
    ],
    skipDuplicates: true
  });
  await prisma.mailContact.createMany({
    data: [
      { ownerUserId: midearmon.id, contactUserId: mike.id, source: "theta-demo" },
      { ownerUserId: mike.id, contactUserId: midearmon.id, source: "theta-demo" },
      { ownerUserId: mike.id, contactUserId: jules.id, source: "theta-demo" }
    ],
    skipDuplicates: true
  });

  const chat = await prisma.chatThread.create({
    data: {
      type: ChatThreadType.DIRECT,
      title: "Theta demo direct chat",
      createdByUserId: midearmon.id,
      lastMessageAt: daysAgo(0, 10)
    }
  });
  await prisma.chatParticipant.createMany({
    data: [
      { threadId: chat.id, userId: midearmon.id, lastReadAt: daysAgo(0, 5) },
      { threadId: chat.id, userId: mike.id, lastReadAt: null }
    ],
    skipDuplicates: true
  });
  await prisma.chatMessage.createMany({
    data: [
      { threadId: chat.id, senderUserId: midearmon.id, body: "Demo chat from desktop to Mike.", createdAt: daysAgo(0, 20) },
      { threadId: chat.id, senderUserId: mike.id, body: "Reply from Mike so the thread has both sides.", createdAt: daysAgo(0, 10) }
    ]
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: mike.id,
        title: "New demo event invite",
        body: "You were invited to Theta Demo Production Night.",
        href: `/events/${event.slug}`,
        readAt: null
      },
      {
        userId: midearmon.id,
        title: "New demo mail",
        body: "Mike has a seeded direct mail thread.",
        href: "/mail",
        readAt: null
      }
    ]
  });

  console.log("Seeded Mike/Midearmon demo coverage for Home, Communications, People, and Production Zone.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
