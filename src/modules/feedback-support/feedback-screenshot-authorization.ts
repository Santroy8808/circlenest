import { prisma } from "@/lib/platform/db";
import { canAccessFeedbackScreenshot } from "@/modules/feedback-support/authorization";

export async function canUserAccessFeedbackScreenshot(mediaAssetId: string, viewerUserId: string) {
  const [ticket, viewer] = await Promise.all([
    prisma.feedbackTicket.findUnique({
      where: { screenshotMediaAssetId: mediaAssetId },
      select: { id: true }
    }),
    prisma.user.findFirst({
      where: { id: viewerUserId, deactivatedAt: null },
      select: { role: true }
    })
  ]);

  return Boolean(
    ticket &&
    viewer &&
    canAccessFeedbackScreenshot(viewer.role)
  );
}
