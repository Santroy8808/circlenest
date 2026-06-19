import { InterestCategory } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { interestCategoryLabels } from "@/modules/ads-credits/types";

const MODULE_KEY = "profile-interests";

const updateProfileInterestsSchema = z.object({
  categories: z.array(z.nativeEnum(InterestCategory)).max(12).default([])
});

export async function getProfileInterests(userId: string) {
  const interests = await prisma.userInterest.findMany({
    where: { userId },
    orderBy: { category: "asc" }
  });

  return interests.map((interest) => ({
    category: interest.category,
    label: interestCategoryLabels[interest.category],
    source: interest.source
  }));
}

export async function updateProfileInterests(userId: string, input: unknown) {
  const parsed = updateProfileInterestsSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid interests." };
  }

  const categories = [...new Set(parsed.data.categories)];

  await prisma.$transaction([
    prisma.userInterest.deleteMany({ where: { userId } }),
    prisma.userInterest.createMany({
      data: categories.map((category) => ({
        userId,
        category,
        source: "self"
      })),
      skipDuplicates: true
    })
  ]);

  await diagnostics.info(MODULE_KEY, "Profile interests updated.", {
    userId,
    count: categories.length
  });

  return { ok: true as const };
}
