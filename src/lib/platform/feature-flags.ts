import { prisma } from "@/lib/platform/db";

export async function isFeatureEnabled(key: string, fallback = false) {
  const flag = await prisma.featureFlag.findUnique({
    where: { key },
    select: { enabled: true }
  });

  return flag?.enabled ?? fallback;
}

export async function setFeatureFlag(key: string, enabled: boolean, description?: string) {
  return prisma.featureFlag.upsert({
    where: { key },
    create: { key, enabled, description },
    update: { enabled, description }
  });
}

