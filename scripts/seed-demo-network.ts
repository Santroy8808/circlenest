import {
  AdCampaignStatus,
  AdDeliveryEventType,
  AdDestinationKind,
  AdPlacement,
  AuditSeverity,
  AuthSecurityEventType,
  ChatAttachmentKind,
  ChatThreadType,
  EventInvitationStatus,
  EventModeratorRole,
  EventRsvpStatus,
  EventStatus,
  FeedReactionType,
  FeedVisibility,
  FeedbackTicketSeverity,
  FeedbackTicketStatus,
  FundContributionStatus,
  FundLedgerEntryType,
  FundraiserCategory,
  FundraiserStatus,
  GroupAssetKind,
  GroupForumReactionType,
  GroupJoinPolicy,
  GroupMemberRole,
  GroupVisibility,
  JobCategory,
  JobEmploymentType,
  JobListingStatus,
  LogLevel,
  MailDeliveryKind,
  MailRecipientType,
  MarketListingCategory,
  MarketListingStatus,
  MediaCollectionType,
  MediaVisibility,
  MembershipTier,
  ManuscriptVisibility,
  PrismaClient,
  ProfileVisibility,
  ScientologyClassification,
  ScientologyVisibility,
  SocialRelationshipType,
  UserRole
} from "@prisma/client";
import { hashPassword } from "../src/modules/auth-security/password";

const prisma = new PrismaClient();

const DEMO_DOMAIN = "demo.theta-space.dev";
const PASSWORD = "Pa$$werd13";
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();

type AccountPlan = {
  key: string;
  email: string;
  username: string;
  displayName: string;
  tagline: string;
  bio: string;
  tier: MembershipTier;
  role: UserRole;
  location: string;
  orgName: string;
  classification: ScientologyClassification;
  trainingLevel: string;
  processingStatus: string;
  createdAt: Date;
  storageLimitBytes: bigint;
  platformCredits: number;
  businessName?: string;
  businessSlug?: string;
  businessTagline?: string;
};

type CreatedAccount = AccountPlan & { id: string };
type MediaRef = {
  id: string;
  ownerUserId: string;
  storageKey: string;
  publicUrl: string | null;
};
type BusinessRef = {
  id: string;
  owner: CreatedAccount;
  slug: string;
  businessName: string;
};
type MarketListingRef = {
  id: string;
  slug: string;
  seller: CreatedAccount;
  title: string;
  priceCents: number;
};
type BusinessArticleRef = {
  id: string;
  slug: string;
  owner: CreatedAccount;
  businessProfileId: string;
  title: string;
};
type AuditorProfileRef = {
  id: string;
  owner: CreatedAccount;
  practiceName: string;
};

const firstNames = [
  "Alden",
  "Amelia",
  "Beau",
  "Bianca",
  "Caleb",
  "Camila",
  "Dane",
  "Daria",
  "Eli",
  "Elena",
  "Felix",
  "Fiona",
  "Grant",
  "Grace",
  "Harlan",
  "Hazel",
  "Isaac",
  "Iris",
  "Jonah",
  "Jules",
  "Kai",
  "Kara",
  "Leo",
  "Lena",
  "Mason",
  "Mara",
  "Nolan",
  "Nia",
  "Owen",
  "Olive",
  "Parker",
  "Paige",
  "Quinn",
  "Rhea",
  "Silas",
  "Sofia",
  "Theo",
  "Tara",
  "Uri",
  "Vera",
  "Wes",
  "Willa",
  "Xander",
  "Yara",
  "Zane",
  "Zoe"
];

const lastNames = [
  "Abbott",
  "Bennett",
  "Caldwell",
  "Delaney",
  "Ellis",
  "Foster",
  "Garrett",
  "Hale",
  "Irwin",
  "James",
  "Keller",
  "Lang",
  "Marlow",
  "Nash",
  "Ortega",
  "Pierce",
  "Quade",
  "Reed",
  "Stone",
  "Tanner",
  "Underwood",
  "Vale",
  "West",
  "Young"
];

const locations = [
  "Austin, TX",
  "Dallas, TX",
  "Clearwater, FL",
  "Los Angeles, CA",
  "Seattle, WA",
  "Phoenix, AZ",
  "Denver, CO",
  "Chicago, IL",
  "Atlanta, GA",
  "Portland, OR"
];

const orgs = [
  "Austin Org",
  "Dallas Org",
  "Flag Service Org",
  "Los Angeles Org",
  "Seattle Org",
  "Phoenix Org",
  "Denver Org",
  "Chicago Org",
  "Atlanta Org",
  "Portland Mission"
];

const trainingLevels = [
  "Student Hat",
  "Pro TRs",
  "Method One Co-Audit",
  "Hubbard Qualified Scientologist",
  "Class 0",
  "Class I",
  "Class II",
  "Class III",
  "Class IV",
  "Class V",
  "Class VI",
  "Class VIII"
];

const processingStatuses = [
  "Grade 0",
  "Grade I",
  "Grade II",
  "Grade III",
  "Grade IV",
  "NED",
  "Clear",
  "OT I",
  "OT II",
  "OT III",
  "OT V",
  "OT VIII"
];

const feedBodies = [
  "Finished a course check sheet section today and had a real win on applying it at work.",
  "Looking for recommendations on study-friendly coffee spots near the org this weekend.",
  "Our local group is putting together a small meetup after service. Everyone has been really helpful.",
  "Shared a few photos from last week's walk and would love feedback on the gallery layout.",
  "The Market has been useful for finding materials without hunting through old group chats.",
  "Trying to keep communication clean and simple this week. Small wins add up.",
  "Does anyone have a favorite workflow for organizing notes after course?",
  "Great conversation with a few friends here. The private network feel is starting to click."
];

const commentBodies = [
  "That is a good win. Thanks for posting it.",
  "I had a similar experience last month.",
  "This is exactly the kind of thing I wanted to see in the stream.",
  "Nice. I saved this so I can come back to it.",
  "Can you share more detail on how you set that up?",
  "That sounds like it would help our group too."
];

const businessPlans = [
  {
    businessName: "BridgePoint Books",
    slug: "bridgepoint-books",
    tagline: "Scientology books, checksheet supplies, and study-room essentials.",
    location: "Clearwater, FL"
  },
  {
    businessName: "ClearComm Creative",
    slug: "clearcomm-creative",
    tagline: "Design, copy, and launch support for mission-aligned businesses.",
    location: "Austin, TX"
  },
  {
    businessName: "Theta Office Supply",
    slug: "theta-office-supply",
    tagline: "Practical office, course-room, and event support materials.",
    location: "Dallas, TX"
  },
  {
    businessName: "ARC Event Works",
    slug: "arc-event-works",
    tagline: "Venue planning, registration flow, and local event promotion.",
    location: "Los Angeles, CA"
  },
  {
    businessName: "Bridge Admin Partners",
    slug: "bridge-admin-partners",
    tagline: "Bookkeeping, admin systems, and lightweight operations help.",
    location: "Seattle, WA"
  }
];

const auditorPracticePlans = [
  {
    practiceName: "Clearwater Standard Tech Auditing",
    location: "Clearwater, FL",
    offerings: "Life repair, grades preparation support, and careful session scheduling."
  },
  {
    practiceName: "Austin ARC Auditing",
    location: "Austin, TX",
    offerings: "Introductory auditing support, communication wins, and local travel by appointment."
  },
  {
    practiceName: "Dallas Bridge Support",
    location: "Dallas, TX",
    offerings: "Pre-session consultation, case admin coordination, and weekend availability."
  },
  {
    practiceName: "West Coast Auditing Office",
    location: "Los Angeles, CA",
    offerings: "Professional auditing practice with flexible scheduling for busy professionals."
  },
  {
    practiceName: "Seattle Field Auditor",
    location: "Seattle, WA",
    offerings: "Field auditing coordination, basic services, and family-friendly scheduling."
  },
  {
    practiceName: "Phoenix Auditing Services",
    location: "Phoenix, AZ",
    offerings: "Auditing support, success tracking, and travel to nearby missions."
  },
  {
    practiceName: "Denver Bridge Consulting",
    location: "Denver, CO",
    offerings: "Consultation, auditing readiness, and study support for active public."
  },
  {
    practiceName: "Chicago Standard Sessions",
    location: "Chicago, IL",
    offerings: "Professional sessions, local scheduling, and course-room coordination."
  },
  {
    practiceName: "Atlanta ARC Practice",
    location: "Atlanta, GA",
    offerings: "Warm, standard auditing support with local and regional appointment windows."
  },
  {
    practiceName: "Portland Auditor Network",
    location: "Portland, OR",
    offerings: "Auditor directory support, introductory consults, and travel-ready sessions."
  }
];

function daysAgo(days: number, minutes = 0) {
  return new Date(NOW.getTime() - days * DAY + minutes * 60 * 1000);
}

function daysFromNow(days: number, minutes = 0) {
  return new Date(NOW.getTime() + days * DAY + minutes * 60 * 1000);
}

function pick<T>(items: T[], index: number) {
  return items[index % items.length];
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function imageUrl(seed: string, width = 900, height = 620) {
  return `https://picsum.photos/seed/${encodeURIComponent(slugify(seed))}/${width}/${height}`;
}

function formatDateSlug(date: Date) {
  return date.toISOString().slice(0, 10);
}

function uniqueUsers(pool: CreatedAccount[], start: number, count: number, excludeIds: string[] = []) {
  const excluded = new Set(excludeIds);
  const selected: CreatedAccount[] = [];
  for (let offset = 0; selected.length < count && offset < pool.length * 3; offset += 1) {
    const candidate = pool[(start + offset * 7) % pool.length];
    if (!excluded.has(candidate.id) && !selected.some((user) => user.id === candidate.id)) {
      selected.push(candidate);
    }
  }
  return selected;
}

function buildAccountPlans(): AccountPlan[] {
  const plans: AccountPlan[] = [];

  for (let index = 1; index <= 100; index += 1) {
    const nameIndex = index - 1;
    const displayName = `${pick(firstNames, nameIndex)} ${pick(lastNames, nameIndex * 3)}`;
    plans.push({
      key: `free-${index.toString().padStart(3, "0")}`,
      email: `free${index.toString().padStart(3, "0")}@${DEMO_DOMAIN}`,
      username: `free${index.toString().padStart(3, "0")}`,
      displayName,
      tagline: "Member exploring groups, friends, jobs, and the stream.",
      bio: `${displayName} is using Theta-Space to keep up with friends, local groups, and useful member resources.`,
      tier: MembershipTier.FREE,
      role: UserRole.MEMBER,
      location: pick(locations, nameIndex),
      orgName: pick(orgs, nameIndex),
      classification: pick(
        [ScientologyClassification.PUBLIC, ScientologyClassification.STAFF, ScientologyClassification.AUDITOR],
        nameIndex
      ),
      trainingLevel: pick(trainingLevels, nameIndex),
      processingStatus: pick(processingStatuses, nameIndex * 2),
      createdAt: daysAgo(92 - (index % 30), index),
      storageLimitBytes: BigInt(100 * 1024 * 1024),
      platformCredits: 0
    });
  }

  for (let index = 1; index <= 25; index += 1) {
    const nameIndex = index + 100;
    const displayName = `${pick(firstNames, nameIndex)} ${pick(lastNames, nameIndex * 5)}`;
    plans.push({
      key: `contributor-${index.toString().padStart(3, "0")}`,
      email: `contributor${index.toString().padStart(3, "0")}@${DEMO_DOMAIN}`,
      username: `contributor${index.toString().padStart(3, "0")}`,
      displayName,
      tagline: "Contributor member active in writing, groups, and Market listings.",
      bio: `${displayName} helps keep discussions active and contributes useful material to the community.`,
      tier: MembershipTier.CONTRIBUTOR,
      role: UserRole.MEMBER,
      location: pick(locations, nameIndex),
      orgName: pick(orgs, nameIndex),
      classification: pick(
        [ScientologyClassification.PUBLIC, ScientologyClassification.STAFF, ScientologyClassification.SEA_ORG],
        nameIndex
      ),
      trainingLevel: pick(trainingLevels, nameIndex),
      processingStatus: pick(processingStatuses, nameIndex * 2),
      createdAt: daysAgo(89 - (index % 24), index * 2),
      storageLimitBytes: BigInt(500 * 1024 * 1024),
      platformCredits: 10
    });
  }

  auditorPracticePlans.forEach((practice, index) => {
    const nameIndex = index + 140;
    const displayName = `${pick(firstNames, nameIndex)} ${pick(lastNames, nameIndex * 7)}`;
    plans.push({
      key: `auditor-${(index + 1).toString().padStart(3, "0")}`,
      email: `auditor${(index + 1).toString().padStart(3, "0")}@${DEMO_DOMAIN}`,
      username: `auditor${(index + 1).toString().padStart(3, "0")}`,
      displayName,
      tagline: `${practice.practiceName} - ${practice.location}`,
      bio: `${displayName} maintains a Find an Auditor listing for ${practice.practiceName} and is available for qualified member inquiries.`,
      tier: MembershipTier.AUDITOR,
      role: UserRole.MEMBER,
      location: practice.location,
      orgName: pick(orgs, nameIndex),
      classification: ScientologyClassification.AUDITOR,
      trainingLevel: pick(["Class IV", "Class V", "Class VI", "Class VIII"], index),
      processingStatus: pick(["Clear", "OT I", "OT III", "OT V", "OT VIII"], index),
      createdAt: daysAgo(88 - index, index * 4),
      storageLimitBytes: BigInt(1024 * 1024 * 1024),
      platformCredits: 35
    });
  });

  businessPlans.forEach((business, index) => {
    const displayName = business.businessName;
    plans.push({
      key: `business-${(index + 1).toString().padStart(3, "0")}`,
      email: `business${(index + 1).toString().padStart(3, "0")}@${DEMO_DOMAIN}`,
      username: `business${(index + 1).toString().padStart(3, "0")}`,
      displayName,
      tagline: business.tagline,
      bio: `${business.businessName} uses Theta-Space for a public storefront, internal member outreach, listings, and ads.`,
      tier: MembershipTier.PROFESSIONAL,
      role: UserRole.MEMBER,
      location: business.location,
      orgName: pick(orgs, index + 3),
      classification: ScientologyClassification.PUBLIC,
      trainingLevel: pick(trainingLevels, index + 5),
      processingStatus: pick(processingStatuses, index + 4),
      createdAt: daysAgo(86 - index, index * 3),
      storageLimitBytes: BigInt(2 * 1024 * 1024 * 1024),
      platformCredits: 100,
      businessName: business.businessName,
      businessSlug: business.slug,
      businessTagline: business.tagline
    });
  });

  return plans;
}

async function stage<T>(name: string, work: () => Promise<T>) {
  console.log(`\n== ${name} ==`);
  const result = await work();
  console.log(`Completed: ${name}`);
  return result;
}

async function cleanupDemoNetwork() {
  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
    select: { id: true }
  });
  const demoUserIds = demoUsers.map((user) => user.id);

  await prisma.feedbackTicket.deleteMany({
    where: {
      OR: [{ publicId: { startsWith: "DEMO-" } }, { reporterUserId: { in: demoUserIds } }]
    }
  });
  await prisma.mailThread.deleteMany({
    where: {
      OR: [{ subject: { startsWith: "[Demo]" } }, { createdByUserId: { in: demoUserIds } }]
    }
  });
  await prisma.chatThread.deleteMany({
    where: {
      OR: [{ title: { startsWith: "Demo " } }, { createdByUserId: { in: demoUserIds } }]
    }
  });
  await prisma.event.deleteMany({ where: { slug: { startsWith: "demo-" } } });
  await prisma.group.deleteMany({ where: { slug: { startsWith: "demo-" } } });
  await prisma.fundraiserCampaign.deleteMany({ where: { slug: { startsWith: "demo-" } } });
  await prisma.writerManuscript.deleteMany({ where: { slug: { startsWith: "demo-" } } });
  await prisma.jobListing.deleteMany({ where: { slug: { startsWith: "demo-" } } });
  await prisma.marketListing.deleteMany({ where: { slug: { startsWith: "demo-" } } });
  await prisma.businessArticle.deleteMany({ where: { slug: { startsWith: "demo-" } } });
  await prisma.businessProfile.deleteMany({ where: { slug: { startsWith: "demo-" } } });
  await prisma.diagnosticLog.deleteMany({ where: { module: { startsWith: "demo-network" } } });
  await prisma.auditLog.deleteMany({ where: { module: { startsWith: "demo-network" } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${DEMO_DOMAIN}` } } });
}

async function seedIdentity() {
  const passwordHash = await hashPassword(PASSWORD);
  const plans = buildAccountPlans();
  const created: CreatedAccount[] = [];

  for (const plan of plans) {
    const user = await prisma.user.create({
      data: {
        email: plan.email,
        username: plan.username,
        passwordHash,
        role: plan.role,
        emailVerified: plan.createdAt,
        lastLoginAt: daysAgo(plan.key.includes("business") ? 1 : (created.length % 12) + 1),
        lastPasswordChangedAt: plan.createdAt,
        createdAt: plan.createdAt
      }
    });

    await prisma.profile.create({
      data: {
        userId: user.id,
        displayName: plan.displayName,
        tagline: plan.tagline,
        bio: plan.bio,
        location: plan.location,
        visibility: ProfileVisibility.MEMBERS,
        avatarUrl: imageUrl(`${plan.username}-avatar`, 300, 300),
        bannerUrl: imageUrl(`${plan.username}-banner`, 1200, 360),
        theme: {
          accent: plan.tier === MembershipTier.PROFESSIONAL ? "gold" : plan.tier === MembershipTier.CONTRIBUTOR ? "blue" : "default",
          demo: true
        }
      }
    });

    await prisma.scientologyProfile.create({
      data: {
        userId: user.id,
        classification: plan.classification,
        orgName: plan.orgName,
        lastServiceName: pick(["Course room", "Auditing session", "Seminar", "Extension course"], created.length),
        lastServiceAt: daysAgo((created.length % 70) + 5),
        trainingLevel: plan.trainingLevel,
        processingStatus: plan.processingStatus,
        goodStandingAttested: true,
        goodStandingUpdatedAt: daysAgo((created.length % 20) + 1),
        educationNotes: `${plan.trainingLevel} training noted for demo classification and filtering.`,
        visibility: ScientologyVisibility.MEMBERS
      }
    });

    await prisma.membership.create({
      data: {
        userId: user.id,
        tier: plan.tier,
        inviteEligibleAt: plan.tier === MembershipTier.FREE ? null : daysFromNow(90),
        storageLimitBytes: plan.storageLimitBytes,
        platformCredits: plan.platformCredits
      }
    });

    await prisma.mailPreference.create({
      data: {
        userId: user.id,
        allowMassMail: true
      }
    });

    await prisma.authSecurityEvent.createMany({
      data: [
        {
          userId: user.id,
          type: AuthSecurityEventType.SIGNUP_CREATED,
          identifier: plan.email,
          metadata: { demo: true, tier: plan.tier },
          createdAt: plan.createdAt
        },
        {
          userId: user.id,
          type: AuthSecurityEventType.EMAIL_VERIFIED,
          identifier: plan.email,
          metadata: { demo: true },
          createdAt: new Date(plan.createdAt.getTime() + 30 * 60 * 1000)
        },
        {
          userId: user.id,
          type: AuthSecurityEventType.LOGIN_SUCCESS,
          identifier: plan.email,
          ipAddress: `10.42.${created.length % 20}.${(created.length % 200) + 20}`,
          userAgent: "Theta-Space Demo Browser",
          metadata: { demo: true },
          createdAt: daysAgo((created.length % 14) + 1)
        }
      ]
    });

    created.push({ ...plan, id: user.id });
  }

  await prisma.mailPolicyConfig.upsert({
    where: { id: "default" },
    update: {
      contributorMassRecipientCap: 0,
      professionalMassRecipientCap: 25,
      auditorMassRecipientCap: 0,
      adminMassRecipientCap: 100,
      massMailCostPerRecipientCredits: 1
    },
    create: {
      id: "default",
      contributorMassRecipientCap: 0,
      professionalMassRecipientCap: 25,
      auditorMassRecipientCap: 0,
      adminMassRecipientCap: 100,
      massMailCostPerRecipientCredits: 1
    }
  });

  console.log(`Created ${created.length} demo accounts.`);
  return created;
}

async function seedSocialGraph(accounts: CreatedAccount[]) {
  const businesses = accounts.filter((account) => account.tier === MembershipTier.PROFESSIONAL);
  const relationships = new Map<string, { fromUserId: string; toUserId: string; type: SocialRelationshipType; note?: string }>();
  const contacts = new Map<string, { ownerUserId: string; contactUserId: string; displayName: string; source: string }>();

  const addRelationship = (from: CreatedAccount, to: CreatedAccount, type: SocialRelationshipType, note?: string) => {
    if (from.id === to.id) {
      return;
    }
    relationships.set(`${from.id}:${to.id}:${type}`, {
      fromUserId: from.id,
      toUserId: to.id,
      type,
      note
    });
  };

  const addContact = (owner: CreatedAccount, contact: CreatedAccount, source: string) => {
    if (owner.id === contact.id) {
      return;
    }
    contacts.set(`${owner.id}:${contact.id}`, {
      ownerUserId: owner.id,
      contactUserId: contact.id,
      displayName: contact.displayName,
      source
    });
  };

  accounts.forEach((account, index) => {
    [1, 2, 7, 13].forEach((step) => {
      const friend = accounts[(index + step) % accounts.length];
      addRelationship(account, friend, SocialRelationshipType.FRIEND, "Demo friend circle");
      addRelationship(friend, account, SocialRelationshipType.FRIEND, "Demo friend circle");
      addContact(account, friend, "friend");
      addContact(friend, account, "friend");
    });

    if (index % 10 === 0) {
      const family = accounts[(index + 3) % accounts.length];
      addRelationship(account, family, SocialRelationshipType.FAMILY, "Demo family tag");
      addRelationship(family, account, SocialRelationshipType.FAMILY, "Demo family tag");
    }

    if (index % 3 === 0) {
      const business = businesses[index % businesses.length];
      addRelationship(account, business, SocialRelationshipType.FOLLOW, "Follows business updates");
      addRelationship(account, business, SocialRelationshipType.CONTACT, "Business contact");
      addContact(account, business, "business");
      addContact(business, account, "customer");
    }
  });

  await prisma.socialRelationship.createMany({
    data: Array.from(relationships.values()),
    skipDuplicates: true
  });
  await prisma.mailContact.createMany({
    data: Array.from(contacts.values()),
    skipDuplicates: true
  });

  console.log(`Created ${relationships.size} social relationships and ${contacts.size} contacts.`);
}

async function createMediaAsset(
  owner: CreatedAccount,
  label: string,
  ageDays: number,
  options: {
    mimeType?: string;
    extension?: string;
    sizeBytes?: number;
    visibility?: MediaVisibility;
    width?: number;
    height?: number;
  } = {}
) {
  const extension = options.extension ?? "jpg";
  const slug = slugify(label);
  const createdAt = daysAgo(ageDays);
  const publicUrl =
    options.mimeType === "application/pdf"
      ? `https://cdn.theta-space.example/demo/${owner.username}/${slug}.pdf`
      : imageUrl(`${owner.username}-${slug}`, options.width ?? 900, options.height ?? 620);

  return prisma.mediaAsset.create({
    data: {
      ownerUserId: owner.id,
      storageKey: `demo/users/${owner.username}/${slug}-${createdAt.getTime()}.${extension}`,
      publicUrl,
      mimeType: options.mimeType ?? "image/jpeg",
      sizeBytes: BigInt(options.sizeBytes ?? 820_000),
      originalName: `${slug}.${extension}`,
      visibility: options.visibility ?? MediaVisibility.MEMBERS,
      metadata: {
        demo: true,
        label,
        source: options.mimeType === "application/pdf" ? "demo-document" : "picsum"
      },
      createdAt
    }
  });
}

async function seedMedia(accounts: CreatedAccount[]) {
  const userMedia = new Map<string, MediaRef[]>();
  const collectionCache = new Map<string, string>();

  const ensureCollection = async (owner: CreatedAccount, type: MediaCollectionType, name: string, slug: string) => {
    const key = `${owner.id}:${type}:${slug}`;
    const existing = collectionCache.get(key);
    if (existing) {
      return existing;
    }
    const collection = await prisma.mediaCollection.create({
      data: {
        ownerUserId: owner.id,
        type,
        name,
        slug
      }
    });
    collectionCache.set(key, collection.id);
    return collection.id;
  };

  const remember = (owner: CreatedAccount, asset: MediaRef) => {
    const list = userMedia.get(owner.id) ?? [];
    list.push(asset);
    userMedia.set(owner.id, list);
  };

  for (const [index, account] of accounts.entries()) {
    const asset = await createMediaAsset(account, `profile-gallery-${index + 1}`, (index % 60) + 2, {
      visibility: index % 4 === 0 ? MediaVisibility.PUBLIC : MediaVisibility.MEMBERS
    });
    remember(account, asset);

    const myPicsId = await ensureCollection(account, MediaCollectionType.ALBUM, "My Pics", "my-pics");
    const tagId = await ensureCollection(account, MediaCollectionType.TAG, pick(["course", "family", "market", "wins", "events"], index), pick(["course", "family", "market", "wins", "events"], index));
    const dateSlug = formatDateSlug(asset.createdAt);
    const dateId = await ensureCollection(account, MediaCollectionType.SYSTEM_DATE, dateSlug, `date-${dateSlug}`);

    await prisma.mediaCollectionAsset.createMany({
      data: [
        { collectionId: myPicsId, mediaAssetId: asset.id },
        { collectionId: tagId, mediaAssetId: asset.id },
        { collectionId: dateId, mediaAssetId: asset.id }
      ],
      skipDuplicates: true
    });

    if (account.tier !== MembershipTier.FREE) {
      const secondAsset = await createMediaAsset(account, `shared-project-${index + 1}`, (index % 45) + 1, {
        visibility: MediaVisibility.MEMBERS,
        width: 1100,
        height: 720
      });
      remember(account, secondAsset);
      await prisma.mediaCollectionAsset.createMany({
        data: [
          { collectionId: myPicsId, mediaAssetId: secondAsset.id },
          { collectionId: tagId, mediaAssetId: secondAsset.id }
        ],
        skipDuplicates: true
      });
    }
  }

  console.log(`Created media pools for ${accounts.length} members.`);
  return userMedia;
}

async function seedFeed(accounts: CreatedAccount[], userMedia: Map<string, MediaRef[]>) {
  const reactions = [
    FeedReactionType.LIKE,
    FeedReactionType.LOVE,
    FeedReactionType.CARE,
    FeedReactionType.HAHA,
    FeedReactionType.WOW
  ];

  for (let index = 0; index < 95; index += 1) {
    const author = accounts[(index * 7) % accounts.length];
    const media = index % 5 === 0 ? userMedia.get(author.id)?.[0] : undefined;
    const post = await prisma.feedPost.create({
      data: {
        authorUserId: author.id,
        body: `${pick(feedBodies, index)} #demo-${index + 1}`,
        visibility: index % 6 === 0 ? FeedVisibility.FRIENDS : FeedVisibility.MEMBERS,
        mediaAssetId: media?.id,
        createdAt: daysAgo(88 - (index % 86), index * 3)
      }
    });

    const reactionUsers = uniqueUsers(accounts, index + 4, 7, [author.id]);
    await prisma.feedPostReaction.createMany({
      data: reactionUsers.map((user, reactionIndex) => ({
        postId: post.id,
        userId: user.id,
        type: pick(reactions, reactionIndex),
        createdAt: daysAgo(87 - (index % 86), reactionIndex)
      })),
      skipDuplicates: true
    });

    for (let commentIndex = 0; commentIndex < 3; commentIndex += 1) {
      const commenter = accounts[(index + commentIndex * 11 + 9) % accounts.length];
      const comment = await prisma.feedComment.create({
        data: {
          postId: post.id,
          authorUserId: commenter.id,
          body: pick(commentBodies, index + commentIndex),
          mediaAssetId: commentIndex === 2 && index % 9 === 0 ? userMedia.get(commenter.id)?.[0]?.id : undefined,
          createdAt: daysAgo(87 - (index % 86), commentIndex * 9)
        }
      });

      await prisma.feedCommentReaction.createMany({
        data: uniqueUsers(accounts, index + commentIndex + 20, 4, [commenter.id]).map((user, reactionIndex) => ({
          commentId: comment.id,
          userId: user.id,
          type: pick(reactions, reactionIndex + commentIndex),
          createdAt: daysAgo(86 - (index % 86), reactionIndex)
        })),
        skipDuplicates: true
      });

      if (commentIndex === 1) {
        const replyAuthor = accounts[(index + 31) % accounts.length];
        await prisma.feedComment.create({
          data: {
            postId: post.id,
            parentCommentId: comment.id,
            authorUserId: replyAuthor.id,
            body: "Good point. I would keep that in the main thread so people can find it later.",
            createdAt: daysAgo(86 - (index % 86), 22)
          }
        });
      }
    }
  }

  console.log("Created stream posts, comments, replies, and reactions.");
}

async function seedGroups(accounts: CreatedAccount[], userMedia: Map<string, MediaRef[]>) {
  const free = accounts.filter((account) => account.tier === MembershipTier.FREE);
  const contributors = accounts.filter((account) => account.tier === MembershipTier.CONTRIBUTOR);
  const businesses = accounts.filter((account) => account.tier === MembershipTier.PROFESSIONAL);
  const groups = [
    ["demo-dallas-course-wins", "Dallas Course Wins", "Course wins, meetups, and local coordination."],
    ["demo-austin-family-activities", "Austin Family Activities", "Weekend family-friendly plans and photos."],
    ["demo-business-owners-exchange", "Business Owners Exchange", "Professional networking and practical business support."],
    ["demo-materials-swap", "Materials Swap", "Useful books, checksheets, supplies, and equipment finds."],
    ["demo-photo-walk-weekly", "Photo Walk Weekly", "Friday photo walks and gallery sharing."],
    ["demo-writers-circle", "Writers Circle", "Manuscripts, chapters, and helpful critique."],
    ["demo-new-members-welcome", "New Members Welcome", "Simple introductions and getting oriented."],
    ["demo-communication-practice", "Communication Practice", "Wins, exercises, and practical application."],
    ["demo-volunteer-coordination", "Volunteer Coordination", "Event support, setup crews, and reminders."],
    ["demo-study-tech-parents", "Study Tech Parents", "Parent resources and school-week routines."],
    ["demo-event-crew", "Event Crew", "Planning, checklists, and day-of coordination."],
    ["demo-clearwater-network", "Clearwater Network", "Local resources and weekly updates."]
  ] as const;

  const groupRefs: { id: string; slug: string; members: CreatedAccount[] }[] = [];

  for (const [index, [slug, name, description]] of groups.entries()) {
    const owner = index % 5 === 0 ? free[index] : index % 3 === 0 ? businesses[index % businesses.length] : contributors[index % contributors.length];
    const maxMembers = owner.tier === MembershipTier.FREE ? 9 : 22 + (index % 20);
    const members = [owner, ...uniqueUsers(accounts, index * 11, maxMembers, [owner.id])];
    const moderators = uniqueUsers([...contributors, ...businesses], index, 2, [owner.id]);

    const group = await prisma.group.create({
      data: {
        slug,
        name,
        tagline: description,
        description: `${description} This demo group has realistic threads, members, photos, documents, and moderator activity.`,
        avatarUrl: imageUrl(`${slug}-avatar`, 320, 320),
        bannerUrl: imageUrl(`${slug}-banner`, 1200, 360),
        visibility: index % 4 === 0 ? GroupVisibility.PRIVATE : GroupVisibility.PUBLIC,
        joinPolicy: index % 3 === 0 ? GroupJoinPolicy.APPROVAL : GroupJoinPolicy.OPEN,
        createdByUserId: owner.id,
        storageLimitBytes: BigInt(40 * 1024 * 1024),
        createdAt: daysAgo(80 - index)
      }
    });

    await prisma.groupMember.createMany({
      data: members.map((member) => ({
        groupId: group.id,
        userId: member.id,
        role: member.id === owner.id ? GroupMemberRole.OWNER : moderators.some((mod) => mod.id === member.id) ? GroupMemberRole.MODERATOR : GroupMemberRole.MEMBER,
        isProvider: member.tier !== MembershipTier.FREE && (members.indexOf(member) + index) % 7 === 0,
        createdAt: daysAgo(79 - index, members.indexOf(member))
      })),
      skipDuplicates: true
    });

    await prisma.groupUserPin.createMany({
      data: members.slice(0, 6).map((member, sortOrder) => ({
        groupId: group.id,
        userId: member.id,
        sortOrder,
        pinnedAt: daysAgo(20 - (sortOrder % 8))
      })),
      skipDuplicates: true
    });

    for (let threadIndex = 0; threadIndex < 3; threadIndex += 1) {
      const threadAuthor = members[(threadIndex * 5 + index) % members.length];
      const thread = await prisma.groupForumThread.create({
        data: {
          groupId: group.id,
          authorUserId: threadAuthor.id,
          title: pick(
            [
              "Weekly plans and updates",
              "Useful resources for new members",
              "Photos and notes from last meetup",
              "What should we pin for this group?",
              "Planning checklist for the next event"
            ],
            index + threadIndex
          ),
          body: "Opening this thread so the group can keep the useful discussion in one place.",
          allowPhotoReplies: threadIndex % 2 === 0,
          pinnedAt: threadIndex === 0 ? daysAgo(15 - index) : null,
          sortOrder: threadIndex,
          endedAt: threadIndex === 2 && index % 4 === 0 ? daysAgo(2) : null,
          endedByUserId: threadIndex === 2 && index % 4 === 0 ? threadAuthor.id : null,
          createdAt: daysAgo(65 - index, threadIndex * 11)
        }
      });

      await prisma.groupForumThreadReaction.createMany({
        data: uniqueUsers(members, threadIndex + index, 5, [threadAuthor.id]).map((member, reactionIndex) => ({
          threadId: thread.id,
          userId: member.id,
          type: pick(
            [GroupForumReactionType.LIKE, GroupForumReactionType.LOVE, GroupForumReactionType.CARE, GroupForumReactionType.WOW],
            reactionIndex
          )
        })),
        skipDuplicates: true
      });

      let parentPostId: string | null = null;
      for (let postIndex = 0; postIndex < 5; postIndex += 1) {
        const poster = members[(postIndex * 3 + threadIndex + index) % members.length];
        const post: { id: string } = await prisma.groupForumPost.create({
          data: {
            threadId: thread.id,
            authorUserId: poster.id,
            parentPostId: postIndex === 3 ? parentPostId : null,
            body: pick(
              [
                "I can help with this.",
                "Adding a note here so it does not get lost.",
                "This would be a good candidate for the pinned area.",
                "I have a photo that fits this discussion.",
                "This worked well for our local group last month."
              ],
              postIndex + index
            ),
            mediaAssetId: postIndex === 3 && thread.allowPhotoReplies ? userMedia.get(poster.id)?.[0]?.id : undefined,
            createdAt: daysAgo(64 - index, postIndex * 12)
          }
        });
        if (postIndex === 1) {
          parentPostId = post.id;
        }
        await prisma.groupForumPostReaction.createMany({
          data: uniqueUsers(members, postIndex + index, 3, [poster.id]).map((member, reactionIndex) => ({
            postId: post.id,
            userId: member.id,
            type: pick([GroupForumReactionType.LIKE, GroupForumReactionType.LOVE, GroupForumReactionType.HAHA], reactionIndex)
          })),
          skipDuplicates: true
        });
      }
    }

    const photoUploader = moderators[0] ?? owner;
    const groupPhoto = await createMediaAsset(photoUploader, `${slug}-group-gallery`, 18 - (index % 9), {
      visibility: MediaVisibility.MEMBERS
    });
    const groupDoc = await createMediaAsset(owner, `${slug}-weekly-notes`, 13 - (index % 7), {
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: 240_000,
      visibility: MediaVisibility.MEMBERS
    });

    for (const [assetIndex, asset] of [groupPhoto, groupDoc].entries()) {
      const groupAsset = await prisma.groupAsset.create({
        data: {
          groupId: group.id,
          mediaAssetId: asset.id,
          uploaderUserId: assetIndex === 0 ? photoUploader.id : owner.id,
          kind: assetIndex === 0 ? GroupAssetKind.PHOTO : GroupAssetKind.DOCUMENT,
          headline: assetIndex === 0 ? "Group highlight photo" : "Weekly notes",
          description: "Seeded demo asset for the group media/documents area.",
          createdAt: daysAgo(12 - (index % 7))
        }
      });
      await prisma.groupAssetComment.create({
        data: {
          groupAssetId: groupAsset.id,
          authorUserId: members[1].id,
          body: "This is useful. Keeping it here for the group.",
          createdAt: daysAgo(10 - (index % 5))
        }
      });
    }

    groupRefs.push({ id: group.id, slug, members });
  }

  console.log(`Created ${groupRefs.length} groups with forums and media.`);
  return groupRefs;
}

async function seedBusinessStorefronts(accounts: CreatedAccount[]) {
  const businesses = accounts.filter((account) => account.tier === MembershipTier.PROFESSIONAL);
  const businessProfiles: BusinessRef[] = [];
  const articles: BusinessArticleRef[] = [];

  for (const [index, owner] of businesses.entries()) {
    const businessProfile = await prisma.businessProfile.create({
      data: {
        ownerUserId: owner.id,
        slug: owner.businessSlug ?? `demo-business-${index + 1}`,
        businessName: owner.businessName ?? owner.displayName,
        tagline: owner.businessTagline,
        description: `${owner.displayName} serves Theta-Space members with practical services, member-friendly support, and clear communication.`,
        location: owner.location,
        publicEmail: owner.email,
        phone: `555-01${index}${index}`,
        website: `https://${owner.businessSlug}.example`,
        logoUrl: imageUrl(`${owner.username}-business-logo`, 420, 420),
        bannerUrl: imageUrl(`${owner.username}-business-banner`, 1400, 420),
        galleryImageUrls: [
          imageUrl(`${owner.username}-storefront-gallery-1`, 900, 620),
          imageUrl(`${owner.username}-storefront-gallery-2`, 900, 620),
          imageUrl(`${owner.username}-storefront-gallery-3`, 900, 620)
        ],
        publicStorefrontEnabled: true,
        emailLinkingEnabled: false,
        createdAt: daysAgo(82 - index)
      }
    });

    businessProfiles.push({
      id: businessProfile.id,
      owner,
      slug: businessProfile.slug,
      businessName: businessProfile.businessName
    });

    await prisma.adCreditLedgerEntry.create({
      data: {
        userId: owner.id,
        amount: 100,
        reason: "Demo business launch ad credits",
        sourceType: "demo-network",
        sourceId: businessProfile.id,
        createdAt: daysAgo(80 - index)
      }
    });

    for (let articleIndex = 0; articleIndex < 2; articleIndex += 1) {
      const cover = await createMediaAsset(owner, `${businessProfile.slug}-article-cover-${articleIndex + 1}`, 22 - articleIndex, {
        visibility: MediaVisibility.PUBLIC
      });
      const article = await prisma.businessArticle.create({
        data: {
          ownerUserId: owner.id,
          businessProfileId: businessProfile.id,
          coverMediaAssetId: cover.id,
          slug: `demo-${businessProfile.slug}-article-${articleIndex + 1}`,
          title: pick(["How we help members get organized", "A practical checklist for smoother projects", "Choosing the right support for your next event"], index + articleIndex),
          summary: "A short demo article for storefront ad destinations.",
          body: "This demo article gives the business a useful destination for ads that is not just a generic external URL.",
          published: true,
          createdAt: daysAgo(24 - articleIndex * 3)
        }
      });
      articles.push({
        id: article.id,
        slug: article.slug,
        owner,
        businessProfileId: businessProfile.id,
        title: article.title
      });
    }
  }

  console.log(`Created ${businessProfiles.length} storefronts and ${articles.length} articles.`);
  return { businessProfiles, articles };
}

async function seedAuditorProfiles(accounts: CreatedAccount[]) {
  const auditors = accounts.filter((account) => account.tier === MembershipTier.AUDITOR);
  const auditorProfiles: AuditorProfileRef[] = [];

  for (const [index, auditor] of auditors.entries()) {
    const practice = auditorPracticePlans[index % auditorPracticePlans.length];
    const profile = await prisma.auditorProfile.create({
      data: {
        userId: auditor.id,
        practiceName: practice.practiceName,
        location: practice.location,
        willingToTravel: index % 2 === 0,
        bio: `${auditor.displayName} focuses on standard, clear communication and a calm session environment for active members in good standing.`,
        offerings: practice.offerings,
        phone: `555-02${index}${index}`,
        website: `https://${slugify(practice.practiceName)}.example`,
        active: true,
        createdAt: daysAgo(45 - index)
      }
    });

    await prisma.adCreditLedgerEntry.create({
      data: {
        userId: auditor.id,
        amount: 35,
        reason: "Demo auditor discovery ad credits",
        sourceType: "demo-network",
        sourceId: profile.id,
        createdAt: daysAgo(35 - index)
      }
    });

    auditorProfiles.push({
      id: profile.id,
      owner: auditor,
      practiceName: profile.practiceName
    });
  }

  console.log(`Created ${auditorProfiles.length} auditor directory listings.`);
  return auditorProfiles;
}

async function seedMarketAndJobs(accounts: CreatedAccount[]) {
  const contributors = accounts.filter((account) => account.tier === MembershipTier.CONTRIBUTOR);
  const businesses = accounts.filter((account) => account.tier === MembershipTier.PROFESSIONAL);
  const listings: MarketListingRef[] = [];
  const categories = [
    MarketListingCategory.BOOKS_MATERIALS,
    MarketListingCategory.COURSE_SUPPLIES,
    MarketListingCategory.BUSINESS_SERVICES,
    MarketListingCategory.EVENTS_SUPPLIES,
    MarketListingCategory.FURNITURE_EQUIPMENT,
    MarketListingCategory.OTHER
  ];

  const createListing = async (seller: CreatedAccount, listingIndex: number, limited: boolean) => {
    const title = pick(
      [
        "Study supply starter pack",
        "Course-room bookshelf set",
        "Event registration table kit",
        "Lightly used seminar projector",
        "Admin workflow setup consult",
        "Training materials organizer",
        "Small group meeting supplies",
        "Business card and flyer design"
      ],
      listingIndex
    );
    const slug = `demo-${seller.username}-market-${listingIndex}`;
    const listing = await prisma.marketListing.create({
      data: {
        sellerUserId: seller.id,
        slug,
        title,
        description: `${title} from ${seller.displayName}. This listing has enough detail to test the thumbnail card and full listing view.`,
        category: pick(categories, listingIndex),
        priceCents: 1500 + ((listingIndex * 875) % 32000),
        currency: "USD",
        status: MarketListingStatus.ACTIVE,
        expiresAt: limited ? daysFromNow(14 - (listingIndex % 4)) : null,
        createdAt: daysAgo(30 - (listingIndex % 20))
      }
    });

    const photo = await createMediaAsset(seller, `${slug}-photo`, 20 - (listingIndex % 12), {
      visibility: MediaVisibility.PUBLIC,
      width: 720,
      height: 720
    });
    await prisma.marketListingPhoto.create({
      data: {
        listingId: listing.id,
        mediaAssetId: photo.id,
        sortOrder: 0
      }
    });
    listings.push({
      id: listing.id,
      slug: listing.slug,
      seller,
      title: listing.title,
      priceCents: listing.priceCents ?? 0
    });
  };

  for (const [index, contributor] of contributors.entries()) {
    await createListing(contributor, index * 2 + 1, true);
    await createListing(contributor, index * 2 + 2, true);
  }

  for (const [index, business] of businesses.entries()) {
    for (let listingIndex = 1; listingIndex <= 4; listingIndex += 1) {
      await createListing(business, 100 + index * 4 + listingIndex, false);
    }

    for (let jobIndex = 1; jobIndex <= 2; jobIndex += 1) {
      await prisma.jobListing.create({
        data: {
          employerUserId: business.id,
          slug: `demo-${business.username}-job-${jobIndex}`,
          title: pick(["Front desk coordinator", "Event support assistant", "Bookkeeper", "Course room logistics helper", "Creative production assistant"], index + jobIndex),
          companyName: business.businessName ?? business.displayName,
          summary: "Professional-tier seeded job listing visible to all members.",
          description: "This job listing includes role details, contact instructions, and a realistic company context for browser QC.",
          category: pick(
            [JobCategory.ADMINISTRATION, JobCategory.DELIVERY, JobCategory.CREATIVE, JobCategory.PROFESSIONAL_SERVICES, JobCategory.TRAINING],
            index + jobIndex
          ),
          employmentType: pick([JobEmploymentType.FULL_TIME, JobEmploymentType.PART_TIME, JobEmploymentType.CONTRACT], index + jobIndex),
          location: business.location,
          remote: jobIndex % 2 === 0,
          compensation: jobIndex % 2 === 0 ? "$25-$35/hr" : "$48k-$62k",
          contactEmail: business.email,
          contactInstructions: "Send a short internal mail with your resume and availability.",
          status: JobListingStatus.ACTIVE,
          createdAt: daysAgo(18 - index * 2 - jobIndex)
        }
      });
    }
  }

  console.log(`Created ${listings.length} Market listings and ${businesses.length * 2} job listings.`);
  return listings;
}

async function seedEvents(accounts: CreatedAccount[]) {
  const contributors = accounts.filter((account) => account.tier === MembershipTier.CONTRIBUTOR);
  const businesses = accounts.filter((account) => account.tier === MembershipTier.PROFESSIONAL);
  const eventPlans = [
    ["demo-regional-networking-night", "Regional Networking Night", "A member networking evening with light refreshments.", 10],
    ["demo-weekend-study-workshop", "Weekend Study Workshop", "A focused Saturday workshop for study wins and planning.", 18],
    ["demo-market-vendor-preview", "Market Vendor Preview", "A simple preview night for business and Market listings.", 25]
  ] as const;
  const events: { id: string; slug: string; title: string; owner: CreatedAccount }[] = [];

  for (const [index, [slug, title, summary, daysOut]] of eventPlans.entries()) {
    const owner = businesses[index % businesses.length];
    const event = await prisma.event.create({
      data: {
        slug,
        title,
        summary,
        description: `${summary} This seeded event has invitations, RSVPs, moderators, and ad promotion candidates.`,
        locationName: pick(["Austin Org Hall", "Clearwater Community Room", "Dallas Mission Event Space"], index),
        address: pick(["100 Demo Way, Austin, TX", "200 Demo Ave, Clearwater, FL", "300 Demo Street, Dallas, TX"], index),
        startsAt: daysFromNow(daysOut),
        endsAt: daysFromNow(daysOut, 180),
        status: EventStatus.PUBLISHED,
        createdByUserId: owner.id,
        createdAt: daysAgo(14 - index * 2)
      }
    });

    await prisma.eventModerator.createMany({
      data: [
        { eventId: event.id, userId: owner.id, role: EventModeratorRole.OWNER },
        { eventId: event.id, userId: contributors[index].id, role: EventModeratorRole.MODERATOR }
      ],
      skipDuplicates: true
    });

    const invitees = uniqueUsers(accounts, index * 19, 55, [owner.id]);
    await prisma.eventInvitation.createMany({
      data: invitees.map((invitee, inviteIndex) => ({
        eventId: event.id,
        inviteeUserId: invitee.id,
        invitedByUserId: owner.id,
        status: pick(
          [EventInvitationStatus.ACCEPTED, EventInvitationStatus.PENDING, EventInvitationStatus.ACCEPTED, EventInvitationStatus.DECLINED],
          inviteIndex
        ),
        note: "Demo event invitation",
        createdAt: daysAgo(12 - index, inviteIndex)
      })),
      skipDuplicates: true
    });

    await prisma.eventRsvp.createMany({
      data: invitees.slice(0, 34).map((invitee, rsvpIndex) => ({
        eventId: event.id,
        userId: invitee.id,
        status: pick([EventRsvpStatus.GOING, EventRsvpStatus.MAYBE, EventRsvpStatus.GOING, EventRsvpStatus.DECLINED], rsvpIndex),
        createdAt: daysAgo(10 - index, rsvpIndex)
      })),
      skipDuplicates: true
    });

    events.push({ id: event.id, slug: event.slug, title: event.title, owner });
  }

  console.log(`Created ${events.length} events with invitations and RSVPs.`);
  return events;
}

async function seedAds(
  accounts: CreatedAccount[],
  businessProfiles: BusinessRef[],
  articles: BusinessArticleRef[],
  listings: MarketListingRef[],
  events: { id: string; slug: string; title: string; owner: CreatedAccount }[],
  auditorProfiles: AuditorProfileRef[]
) {
  const campaigns: string[] = [];

  for (const [index, business] of businessProfiles.entries()) {
    const owner = business.owner;
    const businessListings = listings.filter((listing) => listing.seller.id === owner.id);
    const article = articles.find((candidate) => candidate.owner.id === owner.id);
    const listing = businessListings[0];
    const event = events[index % events.length];
    const campaignPlans = [
      {
        title: `${business.businessName} storefront`,
        body: "Visit the storefront for member-friendly services and resources.",
        destinationKind: AdDestinationKind.STOREFRONT,
        destinationUrl: `/storefront/${business.slug}`,
        marketListingId: null,
        businessArticleId: null
      },
      {
        title: listing?.title ?? `${business.businessName} featured listing`,
        body: "A featured Market listing with a clear price and details.",
        destinationKind: AdDestinationKind.MARKET_LISTING,
        destinationUrl: listing ? `/market/${listing.slug}` : `/storefront/${business.slug}`,
        marketListingId: listing?.id ?? null,
        businessArticleId: null
      },
      {
        title: article?.title ?? `${business.businessName} article`,
        body: "Read a practical article from this business.",
        destinationKind: AdDestinationKind.BUSINESS_ARTICLE,
        destinationUrl: article ? `/storefront/${business.slug}/articles/${article.slug}` : `/storefront/${business.slug}`,
        marketListingId: null,
        businessArticleId: article?.id ?? null
      },
      {
        title: `Promoted event: ${event.title}`,
        body: "Event promotion uses normal ad placement, never an embedded listing ad.",
        destinationKind: AdDestinationKind.STOREFRONT,
        destinationUrl: `/events/${event.slug}`,
        marketListingId: null,
        businessArticleId: null
      }
    ];

    for (const [campaignIndex, campaignPlan] of campaignPlans.entries()) {
      const image = await createMediaAsset(owner, `${business.slug}-ad-${campaignIndex + 1}`, 8 - (campaignIndex % 4), {
        visibility: MediaVisibility.PUBLIC,
        width: 720,
        height: 720
      });
      const campaign = await prisma.adCampaign.create({
        data: {
          ownerUserId: owner.id,
          businessProfileId: business.id,
          marketListingId: campaignPlan.marketListingId,
          businessArticleId: campaignPlan.businessArticleId,
          imageMediaAssetId: image.id,
          title: campaignPlan.title,
          body: campaignPlan.body,
          destinationUrl: campaignPlan.destinationUrl,
          destinationKind: campaignPlan.destinationKind,
          placement: campaignIndex % 3 === 0 ? AdPlacement.BUSINESS_SPOTLIGHT : AdPlacement.RIGHT_STREAM,
          status: AdCampaignStatus.ACTIVE,
          targetLocation: pick(locations, index + campaignIndex),
          totalBudgetCredits: 20,
          dailyBudgetCredits: 3,
          spentCredits: 2 + campaignIndex,
          startsAt: daysAgo(7 - campaignIndex),
          endsAt: daysFromNow(18 + campaignIndex),
          createdAt: daysAgo(9 - campaignIndex)
        }
      });
      campaigns.push(campaign.id);

      const viewers = uniqueUsers(accounts, index * 23 + campaignIndex, 28, [owner.id]);
      await prisma.adDeliveryLog.createMany({
        data: viewers.flatMap((viewer, viewerIndex) => [
          {
            campaignId: campaign.id,
            viewerUserId: viewer.id,
            placement: campaign.placement,
            eventType: AdDeliveryEventType.IMPRESSION,
            metadata: { demo: true, viewport: viewerIndex % 3 === 0 ? "mobile" : "desktop" },
            createdAt: daysAgo(4 - (viewerIndex % 3), viewerIndex)
          },
          ...(viewerIndex % 7 === 0
            ? [
                {
                  campaignId: campaign.id,
                  viewerUserId: viewer.id,
                  placement: campaign.placement,
                  eventType: AdDeliveryEventType.CLICK,
                  metadata: { demo: true, source: "right-stream" },
                  createdAt: daysAgo(3 - (viewerIndex % 2), viewerIndex)
                }
              ]
            : [])
        ])
      });
    }
  }

  for (const [index, auditor] of auditorProfiles.slice(0, 5).entries()) {
    const owner = auditor.owner;
    const image = await createMediaAsset(owner, `${owner.username}-auditor-ad-${index + 1}`, 5 - (index % 3), {
      visibility: MediaVisibility.PUBLIC,
      width: 720,
      height: 720
    });
    const campaign = await prisma.adCampaign.create({
      data: {
        ownerUserId: owner.id,
        imageMediaAssetId: image.id,
        title: `${auditor.practiceName} appointments`,
        body: "Find an Auditor listing with location, travel availability, and offerings.",
        destinationUrl: `/auditors/${owner.username}`,
        destinationKind: AdDestinationKind.STOREFRONT,
        placement: AdPlacement.RIGHT_STREAM,
        status: AdCampaignStatus.ACTIVE,
        targetLocation: owner.location,
        totalBudgetCredits: 8,
        dailyBudgetCredits: 2,
        spentCredits: 1 + (index % 2),
        startsAt: daysAgo(4 - (index % 3)),
        endsAt: daysFromNow(14 + index),
        createdAt: daysAgo(5 - (index % 3))
      }
    });
    campaigns.push(campaign.id);

    const viewers = uniqueUsers(accounts, index * 29, 18, [owner.id]);
    await prisma.adDeliveryLog.createMany({
      data: viewers.flatMap((viewer, viewerIndex) => [
        {
          campaignId: campaign.id,
          viewerUserId: viewer.id,
          placement: campaign.placement,
          eventType: AdDeliveryEventType.IMPRESSION,
          metadata: { demo: true, source: "auditor-directory-ad" },
          createdAt: daysAgo(2 - (viewerIndex % 2), viewerIndex)
        },
        ...(viewerIndex % 6 === 0
          ? [
              {
                campaignId: campaign.id,
                viewerUserId: viewer.id,
                placement: campaign.placement,
                eventType: AdDeliveryEventType.CLICK,
                metadata: { demo: true, destination: `/auditors/${owner.username}` },
                createdAt: daysAgo(1, viewerIndex)
              }
            ]
          : [])
      ])
    });
  }

  console.log(`Created ${campaigns.length} ad campaigns with delivery logs.`);
  return campaigns;
}

async function seedMailAndChat(accounts: CreatedAccount[], businessProfiles: BusinessRef[]) {
  const businesses = accounts.filter((account) => account.tier === MembershipTier.PROFESSIONAL);

  for (const [index, account] of accounts.entries()) {
    if (index % 17 === 0) {
      const sender = businesses[index % businesses.length];
      await prisma.mailSenderOptOut.create({
        data: {
          ownerUserId: account.id,
          senderUserId: sender.id,
          reason: "Demo member opted out from one business sender.",
          createdAt: daysAgo(6)
        }
      });
      await prisma.mailPreference.update({
        where: { userId: account.id },
        data: { allowMassMail: index % 34 !== 0 }
      });
    }
  }

  for (let index = 0; index < 34; index += 1) {
    const sender = accounts[(index * 5) % accounts.length];
    const recipient = accounts[(index * 5 + 9) % accounts.length];
    const thread = await prisma.mailThread.create({
      data: {
        subject: `[Demo] Quick question ${index + 1}`,
        deliveryKind: MailDeliveryKind.DIRECT,
        createdByUserId: sender.id,
        lastMessageAt: daysAgo(10 - (index % 9)),
        createdAt: daysAgo(11 - (index % 9))
      }
    });
    const message = await prisma.mailMessage.create({
      data: {
        threadId: thread.id,
        senderUserId: sender.id,
        subject: thread.subject,
        bodyText: "Can you take a look at this when you have a minute?",
        bodyHtml: "<p>Can you take a look at this when you have a minute?</p>",
        createdAt: daysAgo(10 - (index % 9))
      }
    });
    await prisma.mailRecipient.create({
      data: {
        messageId: message.id,
        userId: recipient.id,
        type: MailRecipientType.TO,
        readAt: index % 4 === 0 ? null : daysAgo(9 - (index % 7))
      }
    });
    await prisma.mailContact.createMany({
      data: [
        { ownerUserId: sender.id, contactUserId: recipient.id, displayName: recipient.displayName, source: "mail" },
        { ownerUserId: recipient.id, contactUserId: sender.id, displayName: sender.displayName, source: "mail" }
      ],
      skipDuplicates: true
    });
  }

  for (const [index, business] of businessProfiles.entries()) {
    const optOuts = await prisma.mailSenderOptOut.findMany({
      where: { senderUserId: business.owner.id },
      select: { ownerUserId: true }
    });
    const blocked = new Set(optOuts.map((optOut) => optOut.ownerUserId));
    const recipients = uniqueUsers(accounts, index * 21, 25, [business.owner.id]).filter((account) => !blocked.has(account.id));
    const thread = await prisma.mailThread.create({
      data: {
        subject: `[Demo] ${business.businessName} member update`,
        deliveryKind: MailDeliveryKind.MASS_INTERNAL,
        createdByUserId: business.owner.id,
        lastMessageAt: daysAgo(5 - index),
        createdAt: daysAgo(6 - index)
      }
    });
    const message = await prisma.mailMessage.create({
      data: {
        threadId: thread.id,
        senderUserId: business.owner.id,
        subject: thread.subject,
        bodyText: "A short internal member update with a clear opt-out path and no external delivery.",
        bodyHtml: "<p>A short internal member update with a clear opt-out path and no external delivery.</p>",
        createdAt: daysAgo(5 - index)
      }
    });
    await prisma.mailRecipient.createMany({
      data: recipients.map((recipient, recipientIndex) => ({
        messageId: message.id,
        userId: recipient.id,
        type: MailRecipientType.TO,
        readAt: recipientIndex % 5 === 0 ? null : daysAgo(4 - (recipientIndex % 3))
      })),
      skipDuplicates: true
    });
  }

  for (const [index, business] of businessProfiles.entries()) {
    const inquirySenders = uniqueUsers(accounts, index * 13, 3, [business.owner.id]);
    for (const [inquiryIndex, sender] of inquirySenders.entries()) {
      const thread = await prisma.mailThread.create({
        data: {
          subject: `[Demo] Inquiry for ${business.businessName} ${inquiryIndex + 1}`,
          deliveryKind: MailDeliveryKind.INQUIRY,
          createdByUserId: sender.id,
          lastMessageAt: daysAgo(3 - inquiryIndex),
          createdAt: daysAgo(3 - inquiryIndex)
        }
      });
      const message = await prisma.mailMessage.create({
        data: {
          threadId: thread.id,
          senderUserId: sender.id,
          subject: thread.subject,
          bodyText: "I saw your storefront and would like more information.",
          bodyHtml: "<p>I saw your storefront and would like more information.</p>",
          createdAt: daysAgo(3 - inquiryIndex)
        }
      });
      await prisma.mailRecipient.create({
        data: {
          messageId: message.id,
          userId: business.owner.id,
          type: MailRecipientType.TO
        }
      });
      await prisma.businessInquiry.create({
        data: {
          businessProfileId: business.id,
          mailThreadId: thread.id,
          senderName: sender.displayName,
          senderEmail: sender.email,
          message: "I saw your storefront and would like more information.",
          createdAt: daysAgo(3 - inquiryIndex)
        }
      });
      await prisma.mailContact.createMany({
        data: [
          { ownerUserId: business.owner.id, contactUserId: sender.id, displayName: sender.displayName, source: "inquiry" },
          { ownerUserId: sender.id, contactUserId: business.owner.id, displayName: business.owner.displayName, source: "inquiry" }
        ],
        skipDuplicates: true
      });
    }
  }

  for (let index = 0; index < 35; index += 1) {
    const sender = accounts[(index * 3) % accounts.length];
    const recipient = accounts[(index * 3 + 8) % accounts.length];
    const thread = await prisma.chatThread.create({
      data: {
        type: ChatThreadType.DIRECT,
        title: `Demo chat ${index + 1}`,
        createdByUserId: sender.id,
        lastMessageAt: daysAgo(index % 9),
        createdAt: daysAgo(20 - (index % 14))
      }
    });
    await prisma.chatParticipant.createMany({
      data: [
        { threadId: thread.id, userId: sender.id, lastReadAt: daysAgo(index % 8) },
        { threadId: thread.id, userId: recipient.id, lastReadAt: index % 5 === 0 ? null : daysAgo(index % 8) }
      ],
      skipDuplicates: true
    });
    const firstMessage = await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        senderUserId: sender.id,
        body: "Quick note from chat.",
        createdAt: daysAgo(index % 9, index)
      }
    });
    if (index % 6 === 0) {
      await prisma.chatAttachment.create({
        data: {
          messageId: firstMessage.id,
          kind: ChatAttachmentKind.IMAGE,
          fileName: `chat-demo-${index + 1}.jpg`,
          mimeType: "image/jpeg",
          sizeBytes: BigInt(320_000),
          storageKey: `demo/chat/chat-demo-${index + 1}.jpg`,
          publicUrl: imageUrl(`chat-demo-${index + 1}`, 640, 480)
        }
      });
    }
    await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        senderUserId: recipient.id,
        body: "Got it. Thanks.",
        createdAt: daysAgo(index % 9, index + 15)
      }
    });
  }

  for (let index = 0; index < 5; index += 1) {
    const participants = uniqueUsers(accounts, index * 17, 7);
    const thread = await prisma.chatThread.create({
      data: {
        type: ChatThreadType.GROUP,
        title: `Demo group chat ${index + 1}`,
        createdByUserId: participants[0].id,
        lastMessageAt: daysAgo(index + 1),
        createdAt: daysAgo(25 - index)
      }
    });
    await prisma.chatParticipant.createMany({
      data: participants.map((participant, participantIndex) => ({
        threadId: thread.id,
        userId: participant.id,
        nickname: participant.displayName.split(" ")[0],
        lastReadAt: participantIndex % 3 === 0 ? null : daysAgo(index + 1)
      })),
      skipDuplicates: true
    });
    for (let messageIndex = 0; messageIndex < 8; messageIndex += 1) {
      await prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          senderUserId: participants[messageIndex % participants.length].id,
          body: pick(["I can make that time.", "Adding this to the checklist.", "Looks good to me.", "Can someone bring extra copies?"], messageIndex),
          createdAt: daysAgo(index + 1, messageIndex * 6)
        }
      });
    }
  }

  console.log("Created direct mail, mass mail, inquiries, direct chats, and group chats.");
}

async function seedFundraisersWritersAndSignals(accounts: CreatedAccount[], groupRefs: { id: string; slug: string; members: CreatedAccount[] }[]) {
  const businesses = accounts.filter((account) => account.tier === MembershipTier.PROFESSIONAL);
  const contributors = accounts.filter((account) => account.tier === MembershipTier.CONTRIBUTOR);

  for (let index = 0; index < 2; index += 1) {
    const creator = businesses[index];
    const campaign = await prisma.fundraiserCampaign.create({
      data: {
        creatorUserId: creator.id,
        slug: `demo-fundraiser-${index + 1}`,
        title: pick(["Community event supply fund", "Materials help for new members"], index),
        summary: "Seeded fundraiser for demo browsing and contribution flow.",
        description: "This fundraiser demonstrates pledge records, confirmed processor-ready entries, and audit-safe ledger separation.",
        category: pick([FundraiserCategory.EVENT_SUPPORT, FundraiserCategory.MATERIALS_SUPPLIES], index),
        goalAmountCents: 150_000 + index * 50_000,
        status: FundraiserStatus.ACTIVE,
        endsAt: daysFromNow(22 + index * 5),
        createdAt: daysAgo(12 - index)
      }
    });
    const contributorsToCampaign = uniqueUsers(accounts, index * 17, 14, [creator.id]);
    for (const [contributionIndex, contributor] of contributorsToCampaign.entries()) {
      const amount = 1000 + contributionIndex * 250;
      const status = contributionIndex % 3 === 0 ? FundContributionStatus.PLEDGED : FundContributionStatus.PROCESSOR_CONFIRMED;
      const intent = await prisma.fundContributionIntent.create({
        data: {
          campaignId: campaign.id,
          contributorUserId: contributor.id,
          contributorName: contributor.displayName,
          amountCents: amount,
          status,
          processorProvider: status === FundContributionStatus.PROCESSOR_CONFIRMED ? "demo-stripe" : null,
          processorReference: status === FundContributionStatus.PROCESSOR_CONFIRMED ? `demo_pi_${campaign.id}_${contributionIndex}` : null,
          note: "Demo fundraiser contribution.",
          createdAt: daysAgo(8 - (contributionIndex % 4))
        }
      });
      if (status === FundContributionStatus.PROCESSOR_CONFIRMED) {
        await prisma.fundLedgerEntry.create({
          data: {
            campaignId: campaign.id,
            entryType: FundLedgerEntryType.PROCESSOR_CONFIRMED_CONTRIBUTION,
            amountCents: amount,
            sourceType: "FundContributionIntent",
            sourceId: intent.id,
            note: "Confirmed demo processor contribution.",
            createdAt: daysAgo(7 - (contributionIndex % 4))
          }
        });
      }
    }
  }

  for (let index = 0; index < 8; index += 1) {
    const author = contributors[index % contributors.length];
    const manuscript = await prisma.writerManuscript.create({
      data: {
        authorUserId: author.id,
        slug: `demo-manuscript-${index + 1}`,
        title: pick(["Notes on Better Communication", "A Small Group Field Guide", "The Weekend Project Journal", "Wins From Practice"], index),
        genre: pick(["Essay", "Field notes", "Memoir", "Guide"], index),
        summary: "Seeded manuscript with readable chapters.",
        visibility: ManuscriptVisibility.MEMBERS,
        createdAt: daysAgo(40 - index)
      }
    });
    for (let chapterIndex = 0; chapterIndex < 2; chapterIndex += 1) {
      const bodyText = `Chapter ${chapterIndex + 1} expands on the manuscript theme with practical observations and a clear demo reading flow.`;
      await prisma.writerChapter.create({
        data: {
          manuscriptId: manuscript.id,
          title: pick(["Opening Notes", "What Worked", "Field Observations", "Next Actions"], chapterIndex + index),
          bodyText,
          bodyHtml: `<p>${bodyText}</p>`,
          wordCount: bodyText.split(/\s+/).length,
          sortOrder: chapterIndex,
          publishedAt: daysAgo(28 - chapterIndex - index),
          autosavedAt: daysAgo(27 - chapterIndex - index),
          createdAt: daysAgo(35 - chapterIndex - index)
        }
      });
    }
  }

  const notificationTargets = uniqueUsers(accounts, 0, 70);
  await prisma.notification.createMany({
    data: notificationTargets.map((user, index) => ({
      userId: user.id,
      title: pick(["New group reply", "Event RSVP reminder", "Mail received", "Market listing saved", "Someone reacted to your post"], index),
      body: "Demo notification used for unread counters and notification-card visual QC.",
      href: pick(["/groups", "/events", "/mail", "/market", "/home"], index),
      readAt: index % 4 === 0 ? null : daysAgo(index % 8),
      createdAt: daysAgo(index % 10)
    }))
  });

  await prisma.alert.createMany({
    data: uniqueUsers(accounts, 9, 30).map((user, index) => ({
      userId: user.id,
      title: pick(["System announcement copied to alerts", "Business inquiry notice", "Terms reminder", "Report status update"], index),
      body: "Demo alert for the dedicated alerts inbox.",
      href: pick(["/alerts", "/mail", "/settings", "/feedback/new"], index),
      readAt: index % 5 === 0 ? null : daysAgo(index % 6),
      createdAt: daysAgo(index % 7)
    }))
  });

  for (let index = 0; index < 6; index += 1) {
    const reporter = accounts[index * 9];
    const ticket = await prisma.feedbackTicket.create({
      data: {
        publicId: `DEMO-${(index + 1).toString().padStart(4, "0")}`,
        reporterUserId: reporter.id,
        reporterEmail: reporter.email,
        pageUrl: pick(["/home", "/groups", "/profile/gallery", "/mail", "/market", "/jobs"], index),
        title: pick(["Upload button unclear", "Group thread spacing issue", "Mail compose question", "Listing card needs price", "Mobile menu note", "Ad preview issue"], index),
        description: "Seeded feedback ticket for admin/support queue testing.",
        severity: pick([FeedbackTicketSeverity.normal, FeedbackTicketSeverity.low, FeedbackTicketSeverity.high], index),
        status: pick([FeedbackTicketStatus.OPEN, FeedbackTicketStatus.IN_REVIEW, FeedbackTicketStatus.RESOLVED], index),
        userAgent: "Theta-Space Demo Browser",
        diagnostics: { demo: true, module: "demo-network" },
        createdAt: daysAgo(5 - (index % 4))
      }
    });
    await prisma.feedbackTicketEvent.create({
      data: {
        ticketId: ticket.id,
        actorId: reporter.id,
        action: "created",
        metadata: { demo: true },
        createdAt: ticket.createdAt
      }
    });
  }

  await prisma.diagnosticLog.createMany({
    data: [
      {
        level: LogLevel.info,
        module: "demo-network.seed",
        message: "Demo network seed completed staged account generation.",
        context: { demo: true, users: accounts.length }
      },
      {
        level: LogLevel.debug,
        module: "demo-network.seed",
        message: "Demo group fixtures created.",
        context: { demo: true, groups: groupRefs.length }
      }
    ]
  });

  await prisma.auditLog.create({
    data: {
      module: "demo-network.seed",
      action: "seed_demo_network",
      severity: AuditSeverity.info,
      metadata: { demo: true, users: accounts.length, groups: groupRefs.length }
    }
  });

  console.log("Created fundraisers, writers, notifications, alerts, feedback, diagnostics, and audit records.");
}

async function printSummary() {
  const [free, contributor, auditor, professional, auditorListings, groups, events, listings, jobs, ads, mail, chats, feedPosts] = await Promise.all([
    prisma.user.count({ where: { email: { endsWith: `@${DEMO_DOMAIN}` }, membership: { is: { tier: MembershipTier.FREE } } } }),
    prisma.user.count({ where: { email: { endsWith: `@${DEMO_DOMAIN}` }, membership: { is: { tier: MembershipTier.CONTRIBUTOR } } } }),
    prisma.user.count({ where: { email: { endsWith: `@${DEMO_DOMAIN}` }, membership: { is: { tier: MembershipTier.AUDITOR } } } }),
    prisma.user.count({ where: { email: { endsWith: `@${DEMO_DOMAIN}` }, membership: { is: { tier: MembershipTier.PROFESSIONAL } } } }),
    prisma.auditorProfile.count({ where: { user: { email: { endsWith: `@${DEMO_DOMAIN}` } } } }),
    prisma.group.count({ where: { slug: { startsWith: "demo-" } } }),
    prisma.event.count({ where: { slug: { startsWith: "demo-" } } }),
    prisma.marketListing.count({ where: { slug: { startsWith: "demo-" } } }),
    prisma.jobListing.count({ where: { slug: { startsWith: "demo-" } } }),
    prisma.adCampaign.count({ where: { owner: { email: { endsWith: `@${DEMO_DOMAIN}` } } } }),
    prisma.mailThread.count({ where: { subject: { startsWith: "[Demo]" } } }),
    prisma.chatThread.count({ where: { title: { startsWith: "Demo " } } }),
    prisma.feedPost.count({ where: { author: { email: { endsWith: `@${DEMO_DOMAIN}` } } } })
  ]);

  console.table({
    free,
    contributor,
    auditor,
    professionalBusiness: professional,
    auditorListings,
    groups,
    events,
    marketListings: listings,
    jobs,
    ads,
    mailThreads: mail,
    chatThreads: chats,
    feedPosts
  });
}

async function main() {
  await stage("Cleanup previous demo network", cleanupDemoNetwork);
  const accounts = await stage("Stage 1: identity and tier accounts", seedIdentity);
  await stage("Stage 2: social graph and contacts", () => seedSocialGraph(accounts));
  const userMedia = await stage("Stage 3: media pools and gallery tags", () => seedMedia(accounts));
  await stage("Stage 4: main stream posts and reactions", () => seedFeed(accounts, userMedia));
  const groupRefs = await stage("Stage 5: groups, forums, photos, and docs", () => seedGroups(accounts, userMedia));
  const { businessProfiles, articles } = await stage("Stage 6: storefronts and business articles", () => seedBusinessStorefronts(accounts));
  const auditorProfiles = await stage("Stage 7: auditor directory listings", () => seedAuditorProfiles(accounts));
  const listings = await stage("Stage 8: Market listings and jobs", () => seedMarketAndJobs(accounts));
  const events = await stage("Stage 9: events, invitations, and RSVPs", () => seedEvents(accounts));
  await stage("Stage 10: ads and delivery logs", () => seedAds(accounts, businessProfiles, articles, listings, events, auditorProfiles));
  await stage("Stage 11: mail, mass mail, inquiries, and chat", () => seedMailAndChat(accounts, businessProfiles));
  await stage("Stage 12: fundraisers, writers, notifications, alerts, and feedback", () => seedFundraisersWritersAndSignals(accounts, groupRefs));
  await stage("Summary", printSummary);

  console.log(`\nDemo network ready. Password for all demo users: ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
