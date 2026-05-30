import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request, context: { params: { postId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const poll = await prisma.postPoll.findUnique({
    where: { postId: context.params.postId },
    include: { options: { select: { id: true } } },
  });
  if (!poll) return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  if (poll.closesAt && poll.closesAt.getTime() < Date.now()) return NextResponse.json({ error: "Poll is closed" }, { status: 400 });

  const body = (await request.json()) as { optionIds?: string[] };
  const optionIds = Array.isArray(body.optionIds) ? Array.from(new Set(body.optionIds.filter(Boolean))) : [];
  if (!optionIds.length) return NextResponse.json({ error: "Select at least one option" }, { status: 400 });
  if (!poll.allowMulti && optionIds.length > 1) return NextResponse.json({ error: "This poll allows one option only" }, { status: 400 });

  const allowed = new Set(poll.options.map((option) => option.id));
  if (optionIds.some((id) => !allowed.has(id))) return NextResponse.json({ error: "Invalid poll option" }, { status: 400 });

  await prisma.postPollVote.deleteMany({ where: { pollId: poll.id, voterId: session.user.id } });
  await prisma.postPollVote.createMany({
    data: optionIds.map((optionId) => ({ pollId: poll.id, optionId, voterId: session.user.id })),
  });

  return NextResponse.json({ ok: true });
}

