import "./load-next-env";
import { PrismaClient, UserRole } from "@prisma/client";
import { compare } from "bcryptjs";
import {
  assertLocalQaDatabase,
  LOCAL_QA_ADMIN_EMAIL,
  LOCAL_QA_DEMO_DOMAIN,
  LOCAL_QA_PASSWORD
} from "./local-qa-database";

const prisma = new PrismaClient();

async function main() {
  assertLocalQaDatabase();

  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${LOCAL_QA_DEMO_DOMAIN}` } },
    select: { id: true }
  });
  const demoUserIds = demoUsers.map((user) => user.id);
  const admin = await prisma.user.findUnique({
    where: { email: LOCAL_QA_ADMIN_EMAIL },
    include: { profile: true, membership: true }
  });

  const [
    members,
    admins,
    onboardingReady,
    relationships,
    feedPosts,
    richFeedPosts,
    groups,
    listings,
    jobs,
    mailThreads,
    chatThreads,
    notifications,
    alerts
  ] = await Promise.all([
    prisma.user.count({ where: { id: { in: demoUserIds }, role: UserRole.MEMBER } }),
    prisma.user.count({ where: { id: { in: demoUserIds }, role: UserRole.ADMIN } }),
    prisma.user.count({
      where: {
        id: { in: demoUserIds },
        onboardingCompletedAt: { not: null },
        termsAcceptedAt: { not: null }
      }
    }),
    prisma.socialRelationship.count({ where: { fromUserId: { in: demoUserIds } } }),
    prisma.feedPost.count({ where: { authorUserId: { in: demoUserIds } } }),
    prisma.feedPost.count({
      where: {
        authorUserId: { in: demoUserIds },
        body: { contains: "#seed-rich-feed-" }
      }
    }),
    prisma.group.count({ where: { slug: { startsWith: "demo-" } } }),
    prisma.marketListing.count({ where: { slug: { startsWith: "demo-" } } }),
    prisma.jobListing.count({ where: { slug: { startsWith: "demo-" } } }),
    prisma.mailThread.count({ where: { subject: { startsWith: "[Demo]" } } }),
    prisma.chatThread.count({ where: { title: { startsWith: "Demo " } } }),
    prisma.notification.count({ where: { userId: { in: demoUserIds } } }),
    prisma.alert.count({ where: { userId: { in: demoUserIds } } })
  ]);

  const passwordVerified = Boolean(
    admin?.passwordHash && (await compare(LOCAL_QA_PASSWORD, admin.passwordHash))
  );

  const result = {
    users: demoUsers.length,
    members,
    admins,
    onboardingReady,
    relationships,
    feedPosts,
    richFeedPosts,
    groups,
    listings,
    jobs,
    mailThreads,
    chatThreads,
    notifications,
    alerts,
    admin: admin
      ? {
          username: admin.username,
          role: admin.role,
          displayName: admin.profile?.displayName,
          tier: admin.membership?.tier,
          passwordVerified
        }
      : null
  };

  console.table(result);

  if (
    demoUsers.length < 10 ||
    members < 8 ||
    admins !== 1 ||
    onboardingReady !== demoUsers.length ||
    !passwordVerified ||
    feedPosts < 100 ||
    mailThreads < 20 ||
    chatThreads < 20
  ) {
    throw new Error("Local QA fixtures failed minimum readiness checks.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
