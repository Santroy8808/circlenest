import { prisma } from "@/lib/platform/db";

export async function getWelcomeTutorialState(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      welcomeTutorialCompletedAt: true
    }
  });

  return {
    completedAt: user?.welcomeTutorialCompletedAt?.toISOString() ?? null,
    shouldPrompt: Boolean(user && !user.welcomeTutorialCompletedAt)
  };
}

export async function markWelcomeTutorialComplete(userId: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      welcomeTutorialCompletedAt: new Date()
    },
    select: {
      welcomeTutorialCompletedAt: true
    }
  });

  return {
    completedAt: user.welcomeTutorialCompletedAt?.toISOString() ?? null,
    shouldPrompt: false
  };
}
