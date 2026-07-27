import "./load-next-env";
import { prisma } from "@/lib/platform/db";
import { sendInviteOrientationEmail } from "@/modules/membership-policy/invite-orientation-email";

async function main() {
  if (!process.argv.includes("--confirm-send")) {
    throw new Error("Refusing to send without --confirm-send.");
  }

  const pendingInvites = await prisma.freeAccountInviteCode.findMany({
    where: {
      isBetaTester: true,
      orientationEmailedAt: null,
      emailedAt: { not: null },
      recipientEmail: { not: null },
      OR: [
        { usedAt: { not: null } },
        {
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() }
        }
      ]
    },
    select: { recipientEmail: true },
    orderBy: { createdAt: "asc" }
  });
  const recipients = [...new Set(
    pendingInvites
      .map((invite) => invite.recipientEmail?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email))
  )];

  for (const recipient of recipients) {
    await sendInviteOrientationEmail(recipient);
    const deliveredAt = new Date();
    await prisma.freeAccountInviteCode.updateMany({
      where: {
        recipientEmail: { equals: recipient, mode: "insensitive" },
        isBetaTester: true,
        orientationEmailedAt: null
      },
      data: { orientationEmailedAt: deliveredAt }
    });
    console.log(`sent ${recipient}`);
  }

  console.log(`completed ${recipients.length} pending invite orientation deliveries`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
