import { prisma } from "@/lib/db/prisma";
import { postSchema } from "@/lib/validation/schemas";
import { sanitizeUserText, checkRateLimitPlaceholder } from "@/lib/security";

export async function createStreamPost(userId: string, rawBody: unknown) {
  const allowed = await checkRateLimitPlaceholder(`post:${userId}`);
  if (!allowed) return { ok: false as const, status: 429, error: "Rate limited" };

  const parsed = postSchema.safeParse(rawBody);
  if (!parsed.success) return { ok: false as const, status: 400, error: "Invalid post" };

  const post = await prisma.post.create({
    data: {
      authorId: userId,
      content: sanitizeUserText(parsed.data.content),
      imageUrl: parsed.data.imageUrl ?? null,
      topic: parsed.data.topic ?? null,
    },
    include: { author: true, comments: true, reactions: true },
  });

  return { ok: true as const, post };
}
