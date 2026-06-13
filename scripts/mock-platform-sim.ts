import { randomUUID } from "crypto";
import { hash } from "bcryptjs";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";

let prisma: any;

type PlanTier = "FREE" | "PLUS" | "PRO";
type ActivityBand = "HEAVY" | "MEDIUM" | "LIGHT";

type SeedUserSpec = {
  username: string;
  fullName: string;
  city: string;
  state: string;
  interests: string;
  relationshipStatus: string;
  bio: string;
};

type UserRecord = {
  id: string;
  username: string;
  fullName: string;
  city: string;
  state: string;
  role: string;
  band: ActivityBand;
  signupMonthIndex: number;
  initialTier: PlanTier;
  currentTier: PlanTier;
  billingActive: boolean;
  cancelAtPeriodEnd: boolean;
  lastBilledMonthIndex: number | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  createdAt: Date;
};

type MonthReport = {
  monthKey: string;
  freeUsers: number;
  plusUsers: number;
  proUsers: number;
  newSignups: number;
  plusRenewals: number;
  proRenewals: number;
  plusUpgrades: number;
  proUpgrades: number;
  cancellations: number;
  revenueCents: number;
  streamPosts: number;
  directStreamPosts: number;
  groupPosts: number;
  comments: number;
  reactions: number;
  messages: number;
  friendRequests: number;
  friendships: number;
  blocks: number;
  groupsCreated: number;
  groupThreadsCreated: number;
  eventsCreated: number;
  bazaarListingsCreated: number;
  jobListingsCreated: number;
  notes: string[];
};

const RUN_ID = process.env.MOCK_PLATFORM_RUN_ID?.trim() || "200-users-6-months";
const OUTPUT_DIR = path.join(process.cwd(), "docs/operations/mock-platform");
const REPORT_DIR = path.join(OUTPUT_DIR, "reports");
const LEDGER_PATH = path.join(OUTPUT_DIR, "mock-platform-log.jsonl");
const STATUS_PATH = path.join(OUTPUT_DIR, "status.json");
const START_MONTH = new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1);
const MONTH_COUNT = 6;
const TOTAL_USERS = Number(process.env.MOCK_PLATFORM_USER_COUNT ?? 200);
const STEP_DELAY_MS = Number(process.env.MOCK_PLATFORM_STEP_DELAY_MS ?? 0);
const MONTH_SIGNUPS = [35, 35, 34, 32, 32, 32];
const HEAVY_COUNT = 20;
const MEDIUM_COUNT = 60;
const LIGHT_COUNT = 120;
const ADMIN_USERNAMES = new Set(["ava", "noah"]);
const PRICE_CENTS: Record<PlanTier, number> = { FREE: 0, PLUS: 300, PRO: 1000 };

const themeSeeds = [
  ["drakudai", "Drakudai", "#0b0b0d", "#d4af37"],
  ["classic-blue", "Classic Blue", "#eff6ff", "#2563eb"],
  ["dark-mode", "Dark Mode", "#0f172a", "#38bdf8"],
  ["neon", "Neon", "#0b1020", "#22d3ee"],
  ["minimal", "Minimal", "#f8fafc", "#0f172a"],
  ["forest", "Forest", "#ecfdf5", "#15803d"],
  ["ocean", "Ocean", "#f0f9ff", "#0284c7"],
  ["sunset", "Sunset", "#fff7ed", "#ea580c"],
  ["cyber", "Cyber", "#111827", "#a855f7"],
  ["pastel", "Pastel", "#fdf2f8", "#ec4899"],
  ["professional", "Professional", "#f8fafc", "#334155"],
  ["retro-web", "Retro Web", "#fffbeb", "#d97706"],
  ["high-contrast", "High Contrast", "#ffffff", "#000000"],
] as const;

const seedUsers: SeedUserSpec[] = [
  { username: "ava", fullName: "Ava Lane", city: "Seattle", state: "WA", interests: "Design, Music, Technology", relationshipStatus: "Single", bio: "Building tiny products and big playlists." },
  { username: "milo", fullName: "Milo Grant", city: "Austin", state: "TX", interests: "Gaming, Startups, Coffee", relationshipStatus: "In a relationship", bio: "Frontend tinkerer and espresso collector." },
  { username: "jules", fullName: "Jules Carter", city: "Denver", state: "CO", interests: "Photography, Hiking, Community", relationshipStatus: "Single", bio: "Weekend trail photos and weekday code." },
  { username: "noah", fullName: "Noah Reed", city: "Portland", state: "OR", interests: "Technology, Film, UX", relationshipStatus: "Married", bio: "Shipping useful things for real people." },
  { username: "rhea", fullName: "Rhea Bloom", city: "Chicago", state: "IL", interests: "Writing, Wellness, Tech", relationshipStatus: "Single", bio: "Notes on product, people, and calm systems." },
  { username: "kai", fullName: "Kai Mercer", city: "San Diego", state: "CA", interests: "Surf, Music, Product", relationshipStatus: "Single", bio: "Sunrise surf then sprint planning." },
  { username: "zoe", fullName: "Zoe Fields", city: "Nashville", state: "TN", interests: "Music, Marketing, Events", relationshipStatus: "Single", bio: "I plan community nights and playlist drops." },
  { username: "liam", fullName: "Liam Fox", city: "Miami", state: "FL", interests: "Fitness, Tech, Travel", relationshipStatus: "Single", bio: "Builder, runner, and occasional drone pilot." },
  { username: "nina", fullName: "Nina Holt", city: "Boston", state: "MA", interests: "Books, Design Systems, Coffee", relationshipStatus: "Complicated", bio: "Design systems by day, mystery novels by night." },
  { username: "omar", fullName: "Omar Voss", city: "Phoenix", state: "AZ", interests: "Security, Linux, DIY", relationshipStatus: "Single", bio: "I automate boring stuff and fix old bikes." },
  { username: "priya", fullName: "Priya Nair", city: "San Jose", state: "CA", interests: "AI, Product, Education", relationshipStatus: "Single", bio: "Teaching, prototyping, repeating." },
  { username: "ethan", fullName: "Ethan Cole", city: "New York", state: "NY", interests: "Finance, Tech, Food", relationshipStatus: "Single", bio: "Data nerd with a dumpling habit." },
  { username: "maya", fullName: "Maya Lin", city: "Los Angeles", state: "CA", interests: "Art, Creator Economy, Video", relationshipStatus: "Single", bio: "Making visual stories and product explainers." },
  { username: "trent", fullName: "Trent Vale", city: "Dallas", state: "TX", interests: "Startups, Sales, Golf", relationshipStatus: "Married", bio: "Partnerships, pipelines, and putting practice." },
  { username: "sora", fullName: "Sora Kim", city: "San Francisco", state: "CA", interests: "Mobile, UX, Minimalism", relationshipStatus: "Single", bio: "Crafting smooth mobile moments." },
  { username: "ivy", fullName: "Ivy Chen", city: "Las Vegas", state: "NV", interests: "Food, Community, Tech", relationshipStatus: "Single", bio: "I organize popups and test side projects." },
  { username: "leo", fullName: "Leo Park", city: "Atlanta", state: "GA", interests: "DevOps, Cloud, Soccer", relationshipStatus: "Single", bio: "Infra calm, deploy fast." },
  { username: "alma", fullName: "Alma Cruz", city: "Brooklyn", state: "NY", interests: "Fashion, Culture, Podcasts", relationshipStatus: "Single", bio: "Culture notes and city discoveries." },
];

const firstNames = [
  "Atlas", "Nova", "Juno", "Iris", "Baxter", "Piper", "Orion", "Sage", "Zuri", "Cedar",
  "Indigo", "Mira", "Finn", "Echo", "Rory", "Skye", "Dex", "Luna", "Tate", "Aria",
  "Rowan", "Vega", "Beau", "Nia", "Jett", "Cora", "Ezra", "Wren", "Mason", "Ruby",
];

const lastNames = [
  "Fox", "Lane", "Grant", "Hart", "Stone", "Vale", "Cruz", "Brooks", "Cole", "Blake",
  "Wren", "Pace", "North", "Bloom", "Quill", "Page", "Mercer", "Parks", "Sloan", "Moss",
];

const cityPool = [
  ["Salt Lake City", "UT"], ["Tampa", "FL"], ["Raleigh", "NC"], ["Madison", "WI"], ["Boise", "ID"],
  ["Sacramento", "CA"], ["Tulsa", "OK"], ["Reno", "NV"], ["Omaha", "NE"], ["Richmond", "VA"],
  ["Boulder", "CO"], ["Savannah", "GA"], ["Spokane", "WA"], ["Charleston", "SC"], ["Fresno", "CA"],
];

const topicPool = ["Technology", "Community", "Design", "Music", "Photography", "Startups", "Wellness", "Gaming"];

const postTemplates = [
  "Morning build check-in: shipped a tiny UX fix and it made a real difference.",
  "Trying a calmer feed this week. The difference is huge.",
  "Direct stream note: sharing a quick update for the people following this thread.",
  "Small group thread update: progress is slow but steady.",
  "Would love feedback on this profile setup and how it reads on mobile.",
  "Anyone else doing a six-month consistency challenge?",
  "Theme tweak of the day: softer contrast, less noise, more breathing room.",
  "Hot take: people actually do read the whole post when it is short and clear.",
] as const;

const groupNames = [
  "Builders Circle", "Quiet Mode Club", "Neighborhood Tech", "Photo Walk Weekly",
  "Friday Draft Club", "Coffee & Code", "City Notes", "Small Wins Club",
] as const;

const eventTitles = [
  "Community Check-in", "Product Demo Night", "Photo Walk", "Write-In Session",
  "Coffee Meetup", "Tiny Launch Review",
] as const;

const bazaarTitles = [
  "Vintage desk lamp", "Used standing desk", "Weekend coding chair", "Minimal poster pack",
  "Camera bag swap", "Studio shelf set",
] as const;

const jobTitles = [
  "Frontend helper", "Part-time community manager", "Photo editor", "Ops coordinator",
  "Freelance design review", "Weekend social host",
] as const;

function seededRandom(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(rng: () => number, items: readonly T[]) {
  return items[Math.floor(rng() * items.length) % items.length];
}

function shuffle<T>(rng: () => number, items: T[]) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function monthStart(index: number) {
  return new Date(START_MONTH.getFullYear(), START_MONTH.getMonth() + index, 1);
}

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function monthDate(monthIndex: number, day: number, hour = 12, minute = 0) {
  return new Date(START_MONTH.getFullYear(), START_MONTH.getMonth() + monthIndex, day, hour, minute, 0, 0);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadLocalEnv() {
  const envFiles = [path.join(process.cwd(), ".env.local"), path.join(process.cwd(), ".env")];
  for (const file of envFiles) {
    try {
      const contents = await readFile(file, "utf8");
      for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const equalsIndex = trimmed.indexOf("=");
        if (equalsIndex < 1) continue;
        const key = trimmed.slice(0, equalsIndex).trim();
        const rawValue = trimmed.slice(equalsIndex + 1).trim();
        const value = rawValue.replace(/^['"]|['"]$/g, "");
        if (!process.env[key] && value) {
          process.env[key] = value;
        }
      }
      break;
    } catch {
      continue;
    }
  }
}

function priceCents(tier: PlanTier) {
  return PRICE_CENTS[tier];
}

async function writeStatus(status: Record<string, unknown>) {
  await writeFile(STATUS_PATH, `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

function signupTierForBand(band: ActivityBand, rng: () => number): PlanTier {
  const roll = rng();
  if (band === "HEAVY") {
    if (roll < 0.35) return "PRO";
    if (roll < 0.8) return "PLUS";
    return "FREE";
  }
  if (band === "MEDIUM") {
    if (roll < 0.15) return "PRO";
    if (roll < 0.55) return "PLUS";
    return "FREE";
  }
  if (roll < 0.07) return "PRO";
  if (roll < 0.18) return "PLUS";
  return "FREE";
}

function bandActivityPlan(band: ActivityBand, monthScale: number) {
  if (band === "HEAVY") {
    return {
      streamPosts: Math.max(2, Math.round(3 * monthScale)),
      directPosts: Math.max(1, Math.round(1 * monthScale)),
      comments: Math.max(1, Math.round(2 * monthScale)),
      reactions: Math.max(1, Math.round(2 * monthScale)),
      messages: Math.max(2, Math.round(3 * monthScale)),
      groupPosts: Math.max(1, Math.round(1 * monthScale)),
      groupReplies: Math.max(1, Math.round(1 * monthScale)),
    };
  }
  if (band === "MEDIUM") {
    return {
      streamPosts: Math.max(1, Math.round(2 * monthScale)),
      directPosts: Math.max(0, Math.round(1 * monthScale)),
      comments: Math.max(1, Math.round(1 * monthScale)),
      reactions: Math.max(1, Math.round(1 * monthScale)),
      messages: Math.max(1, Math.round(2 * monthScale)),
      groupPosts: Math.max(1, Math.round(1 * monthScale)),
      groupReplies: Math.max(0, Math.round(1 * monthScale)),
    };
  }
  return {
    streamPosts: 1,
    directPosts: 0,
    comments: 1,
    reactions: 1,
    messages: 1,
    groupPosts: 0,
    groupReplies: 0,
  };
}

function reportMarkdown(report: MonthReport) {
  return `# Mock platform report - ${report.monthKey}

| Metric | Value |
| --- | ---: |
| Free users | ${report.freeUsers} |
| Plus users | ${report.plusUsers} |
| Pro users | ${report.proUsers} |
| New signups | ${report.newSignups} |
| Plus renewals | ${report.plusRenewals} |
| Pro renewals | ${report.proRenewals} |
| Plus upgrades | ${report.plusUpgrades} |
| Pro upgrades | ${report.proUpgrades} |
| Cancellations | ${report.cancellations} |
| Revenue | $${(report.revenueCents / 100).toFixed(2)} |
| Stream posts | ${report.streamPosts} |
| Direct stream posts | ${report.directStreamPosts} |
| Group posts | ${report.groupPosts} |
| Comments | ${report.comments} |
| Reactions | ${report.reactions} |
| Messages | ${report.messages} |
| Friend requests | ${report.friendRequests} |
| Friendships | ${report.friendships} |
| Blocks | ${report.blocks} |
| Groups created | ${report.groupsCreated} |
| Group forum threads | ${report.groupThreadsCreated} |
| Events created | ${report.eventsCreated} |
| Bazaar listings | ${report.bazaarListingsCreated} |
| Job listings | ${report.jobListingsCreated} |

## Notes
${report.notes.map((note) => `- ${note}`).join("\n")}
`;
}

async function ensureDirs() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });
}

async function resetDb() {
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF;");
  await prisma.reaction.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.messageModerationEvent.deleteMany();
  await prisma.messageThreadPresence.deleteMany();
  await prisma.message.deleteMany();
  await prisma.messageThread.deleteMany();
  await prisma.postPollVote.deleteMany();
  await prisma.postPollOption.deleteMany();
  await prisma.postPoll.deleteMany();
  await prisma.post.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.alertSubscription.deleteMany();
  await prisma.groupForumPost.deleteMany();
  await prisma.groupForumThread.deleteMany();
  await prisma.groupEvent.deleteMany();
  await prisma.groupPhoto.deleteMany();
  await prisma.groupPhotoAlbum.deleteMany();
  await prisma.groupDocument.deleteMany();
  await prisma.groupJoinRequest.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.eventModerator.deleteMany();
  await prisma.eventInvitation.deleteMany();
  await prisma.event.deleteMany();
  await prisma.membershipInvitation.deleteMany();
  await prisma.bazaarListing.deleteMany();
  await prisma.jobListing.deleteMany();
  await prisma.auditorMedia.deleteMany();
  await prisma.auditorListing.deleteMany();
  await prisma.userBlock.deleteMany();
  await prisma.mutedUser.deleteMany();
  await prisma.mutedTopic.deleteMany();
  await prisma.followedTopic.deleteMany();
  await prisma.photoComment.deleteMany();
  await prisma.photoTag.deleteMany();
  await prisma.photoAlbumTag.deleteMany();
  await prisma.userMediaTag.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.photoAlbum.deleteMany();
  await prisma.userUploadAsset.deleteMany();
  await prisma.userFeedPreference.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.friendRequest.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.twoFactorConfig.deleteMany();
  await prisma.userKeyMaterial.deleteMany();
  await prisma.authSecurityEvent.deleteMany();
  await prisma.billingSubscription.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.moderatorActionLog.deleteMany();
  await prisma.adminPetition.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.theme.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON;");
}

async function seedThemes() {
  for (const [key, name, background, accentColor] of themeSeeds) {
    await prisma.theme.create({
      data: {
        key,
        name,
        background,
        accentColor,
        cardStyle: "rounded-soft",
        headerStyle: "solid",
        buttonStyle: "pill",
        fontPairing: "sans/serif",
        patternAsset: `/themes/patterns/${key}.svg`,
      },
    });
  }
}

function buildUserSpec(index: number, band: ActivityBand, rng: () => number): SeedUserSpec & { username: string; role: string; activityBand: ActivityBand; initialTier: PlanTier; signupMonthIndex: number } {
  const base = seedUsers[index];
  if (base) {
    return {
      ...base,
      role: ADMIN_USERNAMES.has(base.username) ? "ADMIN" : "MEMBER",
      activityBand: band,
      initialTier: signupTierForBand(band, rng),
      signupMonthIndex: 0,
    };
  }

  const generatedIndex = index - seedUsers.length;
  const first = firstNames[generatedIndex % firstNames.length];
  const last = lastNames[Math.floor(generatedIndex / firstNames.length) % lastNames.length];
  const city = cityPool[generatedIndex % cityPool.length];
  return {
    username: `mock${String(index + 1).padStart(3, "0")}`,
    fullName: `${first} ${last}`,
    city: city[0],
    state: city[1],
    interests: `${pick(rng, topicPool)}, ${pick(rng, topicPool)}, ${pick(rng, topicPool)}`,
    relationshipStatus: pick(rng, ["Single", "Complicated", "Married"]),
    bio: `${pick(rng, postTemplates)} (${RUN_ID})`,
    role: index < 2 ? "ADMIN" : "MEMBER",
    activityBand: band,
    initialTier: signupTierForBand(band, rng),
    signupMonthIndex: 0,
  };
}

async function createUser(spec: ReturnType<typeof buildUserSpec>, monthIndex: number, passwordHash: string, themeId: string) {
  const createdAt = monthDate(monthIndex, 1 + (monthIndex % 3), 9, 0);
  const user = await prisma.user.create({
    data: {
      fullName: spec.fullName,
      email: `${spec.username}@theta-space.dev`,
      phoneNumber: `555-01${String(monthIndex).padStart(2, "0")}${String(spec.fullName.length).padStart(2, "0")}`,
      backupEmail: `${spec.username}.recovery@theta-space.dev`,
      recoveryPhoneNumber: `555-99${String(monthIndex).padStart(2, "0")}${String(spec.fullName.length).padStart(2, "0")}`,
      username: spec.username,
      passwordHash,
      city: spec.city,
      state: spec.state,
      country: "United States",
      role: spec.role,
      subscriptionTier: spec.initialTier,
      createdAt,
      updatedAt: createdAt,
      profile: {
        create: {
          displayName: spec.fullName,
          bio: spec.bio,
          location: `${spec.city}, ${spec.state}`,
          interests: spec.interests,
          relationshipStatus: spec.relationshipStatus,
          avatarUrl: `/uploads/seed/avatar-${(monthIndex % 8) + 1}.jpg`,
          bannerUrl: `/uploads/seed/banner-${(monthIndex % 6) + 1}.jpg`,
          themeId,
        },
      },
      feedPreference: {
        create: {
          mode: pick(seededRandom(hashString(spec.username)), ["CHRONOLOGICAL", "FRIENDS_FIRST", "INTEREST_BASED", "QUIET", "DISCOVERY"]),
          hiddenPostIds: JSON.stringify([]),
          topicWeights: JSON.stringify({ Technology: 1, Community: 1, Design: 1 }),
        },
      },
    },
    select: { id: true, username: true, fullName: true, role: true, subscriptionTier: true, createdAt: true },
  });

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName ?? spec.fullName,
    city: spec.city,
    state: spec.state,
    role: user.role,
    band: spec.activityBand,
    signupMonthIndex: monthIndex,
    initialTier: spec.initialTier,
    currentTier: spec.initialTier,
    billingActive: spec.initialTier !== "FREE",
    cancelAtPeriodEnd: false,
    lastBilledMonthIndex: spec.initialTier === "FREE" ? null : monthIndex,
    providerCustomerId: spec.initialTier === "FREE" ? null : `mock_cust_${user.id}`,
    providerSubscriptionId: spec.initialTier === "FREE" ? null : `mock_sub_${spec.initialTier.toLowerCase()}_${user.id}`,
    createdAt: user.createdAt,
  } satisfies UserRecord;
}

async function appendLedger(entry: Record<string, unknown>) {
  await writeFile(LEDGER_PATH, `${JSON.stringify(entry)}\n`, { flag: "a" });
}

async function upsertMockSubscription(user: UserRecord, tier: PlanTier, monthIndex: number, status: string) {
  const periodStart = monthDate(monthIndex, 1, 0, 0);
  const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1, 0, 0, 0, 0);
  const providerCustomerId = user.providerCustomerId ?? `mock_cust_${user.id}`;
  const providerSubscriptionId = `mock_sub_${tier.toLowerCase()}_${user.id}`;
  await prisma.billingSubscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      provider: "MOCK",
      providerCustomerId,
      providerSubscriptionId,
      subscriptionTier: tier,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      trialEndsAt: null,
      pausedAt: null,
    },
    update: {
      provider: "MOCK",
      providerCustomerId,
      providerSubscriptionId,
      subscriptionTier: tier,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      trialEndsAt: null,
      pausedAt: null,
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { subscriptionTier: tier } });
  user.providerCustomerId = providerCustomerId;
  user.providerSubscriptionId = providerSubscriptionId;
  user.currentTier = tier;
  user.billingActive = true;
  user.lastBilledMonthIndex = monthIndex;
  user.cancelAtPeriodEnd = false;
}

async function logSignup(user: UserRecord, monthIndex: number) {
  await appendLedger({
    id: randomUUID(),
    monthKey: monthKey(monthDate(monthIndex, 1)),
    eventType: "signup.created",
    userId: user.id,
    username: user.username,
    tier: user.currentTier,
    createdAt: monthDate(monthIndex, 1).toISOString(),
  });
}

async function logBillingEvent(eventType: string, user: UserRecord, monthIndex: number, amountCents: number, note: string) {
  await appendLedger({
    id: randomUUID(),
    monthKey: monthKey(monthDate(monthIndex, 1)),
    eventType,
    userId: user.id,
    username: user.username,
    tier: user.currentTier,
    amountCents,
    note,
    createdAt: monthDate(monthIndex, 1).toISOString(),
  });
}

async function buildSignupSpecs(rng: () => number) {
  const total = TOTAL_USERS;
  const bands: ActivityBand[] = [
    ...Array(HEAVY_COUNT).fill("HEAVY"),
    ...Array(MEDIUM_COUNT).fill("MEDIUM"),
    ...Array(LIGHT_COUNT).fill("LIGHT"),
  ];
  shuffle(rng, bands);

  const specs: Array<ReturnType<typeof buildUserSpec>> = [];
  for (let i = 0; i < total; i++) {
    const band = bands[i] ?? "LIGHT";
    const spec = buildUserSpec(i, band, rng);
    specs.push(spec);
  }

  const monthAssignments: number[] = [];
  for (let monthIndex = 0; monthIndex < MONTH_COUNT; monthIndex++) {
    for (let i = 0; i < MONTH_SIGNUPS[monthIndex]; i++) {
      monthAssignments.push(monthIndex);
    }
  }

  return specs.map((spec, index) => ({ ...spec, signupMonthIndex: monthAssignments[index] ?? 0 }));
}

async function createStreamPost(params: {
  author: UserRecord;
  monthIndex: number;
  rng: () => number;
  targetUser?: UserRecord | null;
  groupId?: string | null;
  approvalStatus?: string;
  postType?: string;
}) {
  const day = 2 + Math.floor(params.rng() * 25);
  const createdAt = monthDate(params.monthIndex, day, 10 + Math.floor(params.rng() * 8), Math.floor(params.rng() * 60));
  const content = pick(params.rng, postTemplates);
  return prisma.post.create({
    data: {
      authorId: params.author.id,
      streamOwnerId: params.targetUser?.id ?? null,
      approvalStatus: params.approvalStatus ?? "APPROVED",
      type: params.postType ?? "TEXT",
      allowReshare: params.rng() > 0.15,
      commentsLocked: params.rng() > 0.8,
      content,
      audience: params.groupId ? "GROUP" : "ALL",
      imageUrl: null,
      mediaUrlsJson: null,
      topic: pick(params.rng, topicPool),
      groupId: params.groupId ?? null,
      createdAt,
      updatedAt: createdAt,
    },
  });
}

async function createComment(params: { postId: string; author: UserRecord; monthIndex: number; rng: () => number; parentCommentId?: string | null }) {
  const createdAt = monthDate(params.monthIndex, 3 + Math.floor(params.rng() * 22), 11, Math.floor(params.rng() * 60));
  return prisma.comment.create({
    data: {
      postId: params.postId,
      authorId: params.author.id,
      parentCommentId: params.parentCommentId ?? null,
      content: pick(params.rng, [
        "Solid update.",
        "This feels very clear.",
        "Nice work here.",
        "Appreciate the context.",
        "This is a good direction.",
        "That reads well on mobile.",
      ]),
      createdAt,
      updatedAt: createdAt,
    },
  });
}

async function createReaction(postId: string, user: UserRecord, rng: () => number) {
  return prisma.reaction.create({
    data: {
      postId,
      userId: user.id,
      type: pick(rng, ["LIKE", "LOVE", "CLAP"]),
    },
  });
}

async function createFriendshipsAndBlocks(users: UserRecord[], rng: () => number, monthIndex: number, stats: MonthReport) {
  const start = Math.max(0, users.length - 30);
  for (let i = start; i < users.length - 1; i += 2) {
    const a = users[i];
    const b = users[i + 1];
    await prisma.friendRequest.create({
      data: {
        senderId: a.id,
        receiverId: b.id,
        status: "ACCEPTED",
      },
    });
    const [userAId, userBId] = [a.id, b.id].sort();
    await prisma.friendship.create({ data: { userAId, userBId } });
    stats.friendRequests += 1;
    stats.friendships += 1;
    await appendLedger({
      id: randomUUID(),
      monthKey: monthKey(monthDate(monthIndex, 1)),
      eventType: "friendship.accepted",
      userId: a.id,
      username: a.username,
      createdAt: monthDate(monthIndex, 4).toISOString(),
      note: `${a.username} and ${b.username} became friends.`,
    });
  }

  for (let i = 0; i < 3; i++) {
    const a = pick(rng, users);
    const b = pick(rng, users.filter((u) => u.id !== a.id));
    await prisma.userBlock.create({
      data: {
        userId: a.id,
        blockedUserId: b.id,
      },
    });
    stats.blocks += 1;
  }
}

async function createThreadMap(users: UserRecord[]) {
  const map = new Map<string, { id: string; a: string; b: string }>();
  for (let i = 0; i < users.length - 1; i += 2) {
    const a = users[i];
    const b = users[i + 1];
    const [userAId, userBId] = [a.id, b.id].sort();
    const thread = await prisma.messageThread.create({
      data: { userAId, userBId },
      select: { id: true, userAId: true, userBId: true },
    });
    await prisma.messageThreadPresence.createMany({
      data: [
        { threadId: thread.id, userId: userAId, isTyping: false, lastSeenAt: new Date() },
        { threadId: thread.id, userId: userBId, isTyping: false, lastSeenAt: new Date() },
      ],
    });
    map.set([userAId, userBId].sort().join(":"), { id: thread.id, a: userAId, b: userBId });
  }
  return map;
}

async function createMessage(threadId: string, sender: UserRecord, body: string, monthIndex: number, day: number) {
  const createdAt = monthDate(monthIndex, day, 13, 0);
  return prisma.message.create({
    data: {
      threadId,
      senderId: sender.id,
      body,
      createdAt,
      readAt: createdAt,
    },
  });
}

async function ensureThread(threadMap: Map<string, { id: string; a: string; b: string }>, a: UserRecord, b: UserRecord) {
  const key = [a.id, b.id].sort().join(":");
  const existing = threadMap.get(key);
  if (existing) return existing.id;
  const [userAId, userBId] = [a.id, b.id].sort();
  const thread = await prisma.messageThread.create({ data: { userAId, userBId }, select: { id: true, userAId: true, userBId: true } });
  await prisma.messageThreadPresence.createMany({
    data: [
      { threadId: thread.id, userId: userAId, isTyping: false, lastSeenAt: new Date() },
      { threadId: thread.id, userId: userBId, isTyping: false, lastSeenAt: new Date() },
    ],
  });
  threadMap.set(key, { id: thread.id, a: userAId, b: userBId });
  return thread.id;
}

async function createGroupMonthActivity(params: {
  monthIndex: number;
  rng: () => number;
  activeUsers: UserRecord[];
  paidUsers: UserRecord[];
  stats: MonthReport;
}) {
  const groupCount = params.monthIndex < 2 ? 1 : params.monthIndex < 4 ? 2 : 3;
  const creators = params.paidUsers.length ? params.paidUsers : params.activeUsers;
  const createdGroups: Array<{ id: string; ownerId: string; name: string }> = [];

  for (let i = 0; i < groupCount; i++) {
    const owner = pick(params.rng, creators);
    const name = `${pick(params.rng, groupNames)} ${params.monthIndex + 1}-${i + 1}`;
    const group = await prisma.group.create({
      data: {
        name,
        description: `Mock group for month ${params.monthIndex + 1}.`,
        ownerId: owner.id,
        visibility: params.rng() > 0.35 ? "PUBLIC" : "PRIVATE",
      },
      select: { id: true, ownerId: true, name: true },
    });
    createdGroups.push(group);
    params.stats.groupsCreated += 1;
    await prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId: owner.id,
        role: "MODERATOR",
      },
    });

    const candidateMembers = shuffle(params.rng, params.activeUsers.filter((user) => user.id !== owner.id)).slice(0, 15 + Math.floor(params.rng() * 15));
    const approvedMembers = candidateMembers.slice(0, Math.max(4, Math.floor(candidateMembers.length * 0.7)));
    const pendingMembers = candidateMembers.slice(approvedMembers.length, approvedMembers.length + 3);
    for (const member of approvedMembers) {
      await prisma.groupMember.create({
        data: {
          groupId: group.id,
          userId: member.id,
          role: params.rng() > 0.85 ? "MODERATOR" : "MEMBER",
        },
      });
    }
    for (const member of pendingMembers) {
      await prisma.groupJoinRequest.create({
        data: {
          groupId: group.id,
          userId: member.id,
          status: "PENDING",
        },
      });
    }

    const thread = await prisma.groupForumThread.create({
      data: {
        groupId: group.id,
        authorId: owner.id,
        title: `${name} month ${params.monthIndex + 1} thread`,
      },
      select: { id: true },
    });
    params.stats.groupThreadsCreated += 1;
    await prisma.groupForumPost.createMany({
      data: [
        {
          threadId: thread.id,
          authorId: owner.id,
          content: `Welcome to ${name}. Let's keep this month calm and useful.`,
        },
        {
          threadId: thread.id,
          authorId: pick(params.rng, approvedMembers.length ? approvedMembers : params.activeUsers).id,
          content: "Posting a quick update so the thread has some activity.",
        },
      ],
    });

    const groupEvent = await prisma.groupEvent.create({
      data: {
        groupId: group.id,
        creatorId: owner.id,
        title: `${name} check-in`,
        description: `Group event for month ${params.monthIndex + 1}.`,
        startsAt: monthDate(params.monthIndex, 14, 18, 0),
      },
      select: { id: true },
    });
    void groupEvent;
    params.stats.eventsCreated += 1;

    const groupPosts = Math.max(1, Math.round((params.monthIndex + 1) / 2));
    for (let p = 0; p < groupPosts; p++) {
      await prisma.post.create({
        data: {
          authorId: pick(params.rng, approvedMembers.length ? approvedMembers : params.activeUsers).id,
          groupId: group.id,
          approvalStatus: "APPROVED",
          type: "TEXT",
          allowReshare: true,
          commentsLocked: false,
          content: `Group update ${p + 1} for ${name}. All text, no images.`,
          audience: "GROUP",
          topic: pick(params.rng, topicPool),
          createdAt: monthDate(params.monthIndex, 12 + p, 16, 0),
          updatedAt: monthDate(params.monthIndex, 12 + p, 16, 0),
        },
      });
      params.stats.groupPosts += 1;
    }
  }

  return createdGroups;
}

async function createBusinessListings(params: {
  monthIndex: number;
  rng: () => number;
  creators: UserRecord[];
  stats: MonthReport;
}) {
  const bazaarCount = params.monthIndex < 2 ? 1 : 2;
  const jobCount = params.monthIndex < 2 ? 1 : 2;
  for (let i = 0; i < bazaarCount; i++) {
    const seller = pick(params.rng, params.creators);
    await prisma.bazaarListing.create({
      data: {
        sellerId: seller.id,
        title: `${pick(params.rng, bazaarTitles)} #${params.monthIndex + 1}-${i + 1}`,
        description: "Mock listing for the monthly simulation.",
        price: Number((15 + params.monthIndex * 3 + i * 2).toFixed(2)),
        currency: "USD",
        location: `${seller.city}, ${seller.state}`,
        category: "General",
        status: "ACTIVE",
      },
    });
    params.stats.bazaarListingsCreated += 1;
  }
  for (let i = 0; i < jobCount; i++) {
    const poster = pick(params.rng, params.creators);
    await prisma.jobListing.create({
      data: {
        creatorId: poster.id,
        companyName: `${poster.fullName} Co.`,
        title: `${pick(params.rng, jobTitles)} ${params.monthIndex + 1}-${i + 1}`,
        duties: "Help keep the monthly simulation moving.",
        requirements: "Reliable, friendly, and okay with text-only posts.",
        salaryMin: 18 + params.monthIndex * 2,
        salaryMax: 30 + params.monthIndex * 3,
        location: `${poster.city}, ${poster.state}`,
        employmentType: "PART_TIME",
        status: "ACTIVE",
      },
    });
    params.stats.jobListingsCreated += 1;
  }
}

async function createEventListings(params: {
  monthIndex: number;
  rng: () => number;
  creators: UserRecord[];
}) {
  const eventCount = params.monthIndex < 2 ? 1 : 2;
  for (let i = 0; i < eventCount; i++) {
    const creator = pick(params.rng, params.creators);
    const event = await prisma.event.create({
      data: {
        creatorId: creator.id,
        title: `${pick(params.rng, eventTitles)} ${params.monthIndex + 1}-${i + 1}`,
        description: "Mock event for the monthly simulation.",
        startsAt: monthDate(params.monthIndex, 18 + i, 19, 0),
        locationName: `${creator.city} Community Space`,
        visibility: "PUBLIC",
      },
      select: { id: true },
    });
    const invitees = params.creators.filter((u) => u.id !== creator.id).slice(0, 6);
    for (const invitee of invitees) {
      await prisma.eventInvitation.create({
        data: {
          eventId: event.id,
          inviteeId: invitee.id,
          status: "INVITED",
        },
      });
    }
    await prisma.eventModerator.create({
      data: {
        eventId: event.id,
        userId: creator.id,
        grantedById: creator.id,
      },
    });
  }
}

async function createStreamActivity(params: {
  monthIndex: number;
  rng: () => number;
  activeUsers: UserRecord[];
  bandByUserId: Map<string, ActivityBand>;
  friendsByUserId: Map<string, string[]>;
  groupIds: string[];
  postOwnerIds: string[];
  stats: MonthReport;
  threadMap: Map<string, { id: string; a: string; b: string }>;
}) {
  const monthScale = [0.8, 0.9, 1.0, 1.0, 1.1, 1.2][params.monthIndex] ?? 1;
  const posts: Array<{ id: string; authorId: string; ownerId: string | null; groupId: string | null }> = [];

  for (const user of params.activeUsers) {
    const band = params.bandByUserId.get(user.id) ?? "LIGHT";
    const activity = bandActivityPlan(band, monthScale);
    const friendCandidates = params.friendsByUserId.get(user.id) ?? [];
    const groupId = params.groupIds.length ? pick(params.rng, params.groupIds) : null;

    for (let i = 0; i < activity.streamPosts; i++) {
      const post = await createStreamPost({
        author: user,
        monthIndex: params.monthIndex,
        rng: params.rng,
      });
      posts.push({ id: post.id, authorId: user.id, ownerId: null, groupId: null });
      params.stats.streamPosts += 1;
    }

    for (let i = 0; i < activity.directPosts; i++) {
      const targetId = friendCandidates.length ? pick(params.rng, friendCandidates) : pick(params.rng, params.postOwnerIds.filter((id) => id !== user.id));
      const target = params.postOwnerIds.length ? params.activeUsers.find((candidate) => candidate.id === targetId) : null;
      const post = await createStreamPost({
        author: user,
        monthIndex: params.monthIndex,
        rng: params.rng,
        targetUser: target ?? undefined,
        approvalStatus: params.rng() > 0.5 ? "PENDING" : "APPROVED",
      });
      posts.push({ id: post.id, authorId: user.id, ownerId: target?.id ?? null, groupId: null });
      params.stats.directStreamPosts += 1;
    }

    for (let i = 0; i < activity.groupPosts && groupId; i++) {
      const post = await createStreamPost({
        author: user,
        monthIndex: params.monthIndex,
        rng: params.rng,
        groupId,
      });
      posts.push({ id: post.id, authorId: user.id, ownerId: null, groupId });
      params.stats.groupPosts += 1;
    }

    for (let i = 0; i < activity.messages; i++) {
      const targetId = friendCandidates.length ? pick(params.rng, friendCandidates) : pick(params.rng, params.postOwnerIds.filter((id) => id !== user.id));
      const target = params.activeUsers.find((candidate) => candidate.id === targetId);
      if (!target) continue;
      const threadId = await ensureThread(params.threadMap, user, target);
      const body = pick(params.rng, [
        "Quick check-in from the monthly sim.",
        "Sharing a small update and moving on.",
        "Keeping it light this month.",
        "Just one more note for the thread.",
      ]);
      await createMessage(threadId, user, body, params.monthIndex, 3 + Math.floor(params.rng() * 22));
      params.stats.messages += 1;
      await prisma.notification.create({
        data: {
          userId: target.id,
          type: "NEW_MESSAGE",
          body: "You received a new message.",
          targetUrl: `/messages/${threadId}`,
        },
      });
    }
  }

  for (const post of posts) {
    const commenterPool = params.activeUsers.filter((user) => user.id !== post.authorId);
    if (!commenterPool.length) continue;
    if (params.rng() < 0.4) {
      const commenter = pick(params.rng, commenterPool);
      const comment = await createComment({ postId: post.id, author: commenter, monthIndex: params.monthIndex, rng: params.rng });
      params.stats.comments += 1;
      await prisma.notification.create({
        data: {
          userId: post.authorId,
          type: "NEW_COMMENT",
          body: "Someone commented on your post.",
          targetUrl: `/posts/${post.id}`,
        },
      });
      if (params.rng() < 0.35) {
        const replyAuthor = pick(params.rng, commenterPool.filter((user) => user.id !== commenter.id));
        await createComment({ postId: post.id, author: replyAuthor, monthIndex: params.monthIndex, rng: params.rng, parentCommentId: comment.id });
        params.stats.comments += 1;
      }
    }
    if (params.rng() < 0.55) {
      const reactor = pick(params.rng, commenterPool);
      await createReaction(post.id, reactor, params.rng);
      params.stats.reactions += 1;
      await prisma.notification.create({
        data: {
          userId: post.authorId,
          type: "NEW_REACTION",
          body: "Your post got a new reaction.",
          targetUrl: `/posts/${post.id}`,
        },
      });
    }
  }
}

async function processMonthlyBilling(params: {
  monthIndex: number;
  rng: () => number;
  users: UserRecord[];
  stats: MonthReport;
}) {
  const monthUsers = params.users.filter((user) => user.signupMonthIndex <= params.monthIndex);
  const paidRenewals = monthUsers.filter((user) => user.billingActive && !user.cancelAtPeriodEnd && user.lastBilledMonthIndex !== null && user.lastBilledMonthIndex < params.monthIndex);
  for (const user of paidRenewals) {
    const amountCents = priceCents(user.currentTier);
    await upsertMockSubscription(user, user.currentTier, params.monthIndex, "ACTIVE");
    await logBillingEvent(user.currentTier === "PLUS" ? "subscription.renewed.plus" : "subscription.renewed.pro", user, params.monthIndex, amountCents, "Mock renewal on first of month.");
    if (user.currentTier === "PLUS") params.stats.plusRenewals += 1;
    if (user.currentTier === "PRO") params.stats.proRenewals += 1;
    params.stats.revenueCents += amountCents;
  }

  const signupsThisMonth = monthUsers.filter((user) => user.signupMonthIndex === params.monthIndex);
  for (const user of signupsThisMonth) {
    params.stats.newSignups += 1;
    await logSignup(user, params.monthIndex);
    if (user.initialTier !== "FREE") {
      const amountCents = priceCents(user.initialTier);
      await upsertMockSubscription(user, user.initialTier, params.monthIndex, "ACTIVE");
      await logBillingEvent("checkout.completed", user, params.monthIndex, amountCents, `Initial ${user.initialTier} checkout on first of month.`);
      params.stats.revenueCents += amountCents;
    }
  }

  const freeUsers = monthUsers.filter((user) => user.currentTier === "FREE");
  const plusUsers = monthUsers.filter((user) => user.currentTier === "PLUS");
  const upgradeFreeToPlus = Math.min(3 + params.monthIndex, freeUsers.length);
  const upgradeFreeToPro = Math.min(Math.max(0, params.monthIndex - 1), Math.max(0, freeUsers.length - upgradeFreeToPlus));
  const upgradePlusToPro = Math.min(Math.max(0, params.monthIndex - 2), plusUsers.length);

  for (let i = 0; i < upgradeFreeToPlus; i++) {
    const user = freeUsers[i];
    await upsertMockSubscription(user, "PLUS", params.monthIndex, "ACTIVE");
    await logBillingEvent("checkout.upgrade.plus", user, params.monthIndex, priceCents("PLUS"), "Mock Free -> Plus upgrade.");
    params.stats.plusUpgrades += 1;
    params.stats.revenueCents += priceCents("PLUS");
  }
  for (let i = 0; i < upgradeFreeToPro; i++) {
    const user = freeUsers[upgradeFreeToPlus + i];
    if (!user) break;
    await upsertMockSubscription(user, "PRO", params.monthIndex, "ACTIVE");
    await logBillingEvent("checkout.upgrade.pro", user, params.monthIndex, priceCents("PRO"), "Mock Free -> Pro upgrade.");
    params.stats.proUpgrades += 1;
    params.stats.revenueCents += priceCents("PRO");
  }
  for (let i = 0; i < upgradePlusToPro; i++) {
    const user = plusUsers[i];
    if (!user) break;
    await upsertMockSubscription(user, "PRO", params.monthIndex, "ACTIVE");
    await logBillingEvent("subscription.updated.pro", user, params.monthIndex, priceCents("PRO"), "Mock Plus -> Pro upgrade.");
    params.stats.proUpgrades += 1;
    params.stats.revenueCents += priceCents("PRO");
  }

  const churnTargets = monthUsers.filter((user) => user.currentTier !== "FREE" && !user.cancelAtPeriodEnd);
  const churnCount = Math.min(1 + Math.floor(params.monthIndex / 2), churnTargets.length);
  for (let i = 0; i < churnCount; i++) {
    const user = churnTargets[(i * 3) % churnTargets.length];
    user.cancelAtPeriodEnd = true;
    params.stats.cancellations += 1;
    await logBillingEvent("subscription.canceled", user, params.monthIndex, 0, "Cancel at period end set on the first of the month.");
  }
}

async function main() {
  await loadLocalEnv();
  const prismaModule = await import("../src/lib/db/prisma");
  prisma = prismaModule.prisma;
  const rng = seededRandom(hashString(RUN_ID));
  const passwordHash = await hash("password123", 10);
  await ensureDirs();
  await writeFile(LEDGER_PATH, "", "utf8");
  await rm(REPORT_DIR, { recursive: true, force: true }).catch(() => undefined);
  await mkdir(REPORT_DIR, { recursive: true });
  await writeStatus({
    runId: RUN_ID,
    phase: "starting",
    monthIndex: -1,
    monthKey: null,
    totalUsersPlanned: TOTAL_USERS,
    stepDelayMs: STEP_DELAY_MS,
    timestamp: new Date().toISOString(),
  });
  await resetDb();
  await seedThemes();

  const themeIds = await prisma.theme.findMany({ orderBy: { name: "asc" }, select: { id: true } });
  const specs = await buildSignupSpecs(rng);
  const users: UserRecord[] = [];
  const monthlySignupBuckets: Record<number, typeof specs> = {};
  for (const spec of specs) {
    (monthlySignupBuckets[spec.signupMonthIndex] ??= []).push(spec);
  }

  const reports: MonthReport[] = [];

  for (let monthIndex = 0; monthIndex < MONTH_COUNT; monthIndex++) {
    const notes: string[] = [];
    const stats: MonthReport = {
      monthKey: monthKey(monthStart(monthIndex)),
      freeUsers: 0,
      plusUsers: 0,
      proUsers: 0,
      newSignups: 0,
      plusRenewals: 0,
      proRenewals: 0,
      plusUpgrades: 0,
      proUpgrades: 0,
      cancellations: 0,
      revenueCents: 0,
      streamPosts: 0,
      directStreamPosts: 0,
      groupPosts: 0,
      comments: 0,
      reactions: 0,
      messages: 0,
      friendRequests: 0,
      friendships: 0,
      blocks: 0,
      groupsCreated: 0,
      groupThreadsCreated: 0,
      eventsCreated: 0,
      bazaarListingsCreated: 0,
      jobListingsCreated: 0,
      notes,
    };

    const bucket = monthlySignupBuckets[monthIndex] ?? [];
    for (const spec of bucket) {
      const theme = themeIds[Math.floor(rng() * themeIds.length)]?.id;
      if (!theme) continue;
      const user = await createUser(spec, monthIndex, passwordHash, theme);
      users.push(user);
    }

    await processMonthlyBilling({ monthIndex, rng, users, stats });

    const activeUsers = users.filter((user) => user.signupMonthIndex <= monthIndex);
    stats.freeUsers = activeUsers.filter((user) => user.currentTier === "FREE").length;
    stats.plusUsers = activeUsers.filter((user) => user.currentTier === "PLUS").length;
    stats.proUsers = activeUsers.filter((user) => user.currentTier === "PRO").length;

    const bandByUserId = new Map(users.map((user) => [user.id, user.band]));
    const friendsByUserId = new Map<string, string[]>();
    const postOwnerIds = activeUsers.map((user) => user.id);
    const paidCreators = activeUsers.filter((user) => user.currentTier !== "FREE" || user.role === "ADMIN");

    for (const user of activeUsers) {
      friendsByUserId.set(user.id, []);
    }

    for (let i = 0; i < activeUsers.length - 1; i += 2) {
      const a = activeUsers[i];
      const b = activeUsers[i + 1];
      if (!a || !b) continue;
      friendsByUserId.get(a.id)?.push(b.id);
      friendsByUserId.get(b.id)?.push(a.id);
    }

    await createFriendshipsAndBlocks(activeUsers, rng, monthIndex, stats);
    const threadMap = await createThreadMap(activeUsers);
    const groups = await createGroupMonthActivity({
      monthIndex,
      rng,
      activeUsers,
      paidUsers: paidCreators,
      stats,
    });
    await createEventListings({ monthIndex, rng, creators: paidCreators });
    await createBusinessListings({ monthIndex, rng, creators: paidCreators, stats });
    await createStreamActivity({
      monthIndex,
      rng,
      activeUsers,
      bandByUserId,
      friendsByUserId,
      groupIds: groups.map((group) => group.id),
      postOwnerIds,
      stats,
      threadMap,
    });

    notes.push(`Billing ran on the first day of ${stats.monthKey}.`);
    notes.push(`${activeUsers.filter((user) => user.band === "HEAVY").length} heavy users, ${activeUsers.filter((user) => user.band === "MEDIUM").length} medium users, ${activeUsers.filter((user) => user.band === "LIGHT").length} light users.`);
    notes.push("Posts were text only; no images or uploads were created.");
    notes.push("Ad testing skipped because ad auction/payment tracking is still not configured.");
    reports.push(stats);

    await writeStatus({
      runId: RUN_ID,
      phase: "month-complete",
      monthIndex,
      monthKey: stats.monthKey,
      usersCreated: users.length,
      report: stats,
      timestamp: new Date().toISOString(),
    });
    console.log(`[${stats.monthKey}] users=${users.length} revenue=$${(stats.revenueCents / 100).toFixed(2)} posts=${stats.streamPosts + stats.groupPosts}`);
    if (STEP_DELAY_MS > 0 && monthIndex < MONTH_COUNT - 1) {
      await sleep(STEP_DELAY_MS);
    }
  }

  for (const report of reports) {
    await writeFile(path.join(REPORT_DIR, `${report.monthKey}.md`), `${reportMarkdown(report)}\n`, "utf8");
  }

  const readmeLines = [
    "# Mock Platform Simulation",
    "",
    `Run ID: ${RUN_ID}`,
    "",
    "This run used 200 users across 6 months of staged use.",
    "Billing was processed on the first day of each month.",
    "Posts were text-only; no images were generated.",
    "Ad testing was skipped because ad auction/payment tracking is not configured yet.",
    "",
    "## Reports",
    ...reports.map((report) => `- [${report.monthKey}](./reports/${report.monthKey}.md) - $${(report.revenueCents / 100).toFixed(2)} revenue`),
    "",
    "## Ledger",
    `- [Mock platform log](./mock-platform-log.jsonl)`,
  ];
  await writeFile(path.join(OUTPUT_DIR, "README.md"), `${readmeLines.join("\n")}\n`, "utf8");
  await writeStatus({
    runId: RUN_ID,
    phase: "complete",
    monthIndex: MONTH_COUNT - 1,
    monthKey: reports[reports.length - 1]?.monthKey ?? null,
    usersCreated: users.length,
    reports: reports.map((report) => ({ monthKey: report.monthKey, revenueCents: report.revenueCents })),
    ledgerPath: path.relative(process.cwd(), LEDGER_PATH),
    reportDir: path.relative(process.cwd(), REPORT_DIR),
    timestamp: new Date().toISOString(),
  });

  console.log("Mock platform simulation complete.");
  console.log(`Users created: ${users.length}`);
  console.log(`Ledger: ${LEDGER_PATH}`);
  console.log(`Reports: ${REPORT_DIR}`);
}

main().finally(async () => {
  await prisma.$disconnect();
});
