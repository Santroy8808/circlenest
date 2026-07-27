import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/platform/db";

export async function canUserAccessFeedbackScreenshot(mediaAssetId: string, viewerUserId: string) {
  const [ticket, viewer] = await Promise.all([
    prisma.feedbackTicket.findUnique({
      where: { screenshotMediaAssetId: mediaAssetId },
      select: { reporterUserId: true }
    }),
    prisma.user.findFirst({
      where: { id: viewerUserId, deactivatedAt: null },
      select: { role: true }
    })
  ]);

  return Boolean(
    ticket &&
    viewer &&
    (ticket.reporterUserId === viewerUserId ||
      viewer.role === UserRole.ADMIN ||
      viewer.role === UserRole.GOD)
  );
}
