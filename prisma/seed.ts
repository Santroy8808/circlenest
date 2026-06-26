import { MembershipTier, PrismaClient, UserRole } from "@prisma/client";
import { hashPassword } from "../src/modules/auth-security/password";

const prisma = new PrismaClient();

const password = "Pa$$werd13";

const seedUsers = [
  { email: "mike@theta-space.net", username: "mike", displayName: "Mike", tier: MembershipTier.FREE, role: UserRole.MEMBER },
  { email: "jules@theta-space.net", username: "jules", displayName: "Jules", tier: MembershipTier.FREE, role: UserRole.MEMBER },
  { email: "john@theta-space.net", username: "john", displayName: "John", tier: MembershipTier.FREE, role: UserRole.MEMBER },
  { email: "sally@theta-space.net", username: "sally", displayName: "Sally", tier: MembershipTier.FREE, role: UserRole.MEMBER },
  { email: "contributor@theta-space.net", username: "contributor", displayName: "Contributor", tier: MembershipTier.CONTRIBUTOR, role: UserRole.MEMBER },
  {
    email: "professional@theta-space.net",
    username: "professional",
    displayName: "Professional",
    tier: MembershipTier.PROFESSIONAL,
    role: UserRole.MEMBER
  },
  { email: "auditor@theta-space.net", username: "auditor", displayName: "Auditor", tier: MembershipTier.AUDITOR, role: UserRole.MEMBER },
  { email: "admin@theta-space.net", username: "admin", displayName: "Admin", tier: MembershipTier.FREE, role: UserRole.GOD }
];

async function main() {
  const passwordHash = await hashPassword(password);

  for (const seedUser of seedUsers) {
    const user = await prisma.user.upsert({
      where: { email: seedUser.email },
      update: {
        username: seedUser.username,
        passwordHash,
        role: seedUser.role,
        emailVerified: new Date(),
        deactivatedAt: null,
        failedLoginCount: 0,
        lastPasswordChangedAt: new Date()
      },
      create: {
        email: seedUser.email,
        username: seedUser.username,
        passwordHash,
        role: seedUser.role,
        emailVerified: new Date(),
        lastPasswordChangedAt: new Date()
      }
    });

    await prisma.profile.upsert({
      where: { userId: user.id },
      update: { displayName: seedUser.displayName },
      create: { userId: user.id, displayName: seedUser.displayName }
    });

    await prisma.membership.upsert({
      where: { userId: user.id },
      update: { tier: seedUser.tier },
      create: { userId: user.id, tier: seedUser.tier }
    });
  }

  console.log(`Seeded ${seedUsers.length} preverified users. Password: ${password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
