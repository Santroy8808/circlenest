import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET(_request: Request, context: { params: { postId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const poll = await prisma.postPoll.findUnique({
    where: { postId: context.params.postId },
    include: {
      options: {
        include: {
          _count: { select: { votes: true } },
        },
      },
      votes: { where: { voterId: session.user.id }, select: { optionId: true } },
    },
  });
  if (!poll) return NextResponse.json({ error: "Poll not found" }, { status: 404 });

  const myOptionIds = new Set(poll.votes.map((vote) => vote.optionId));
  return NextResponse.json({
    id: poll.id,
    question: poll.question,
    allowMulti: poll.allowMulti,
    closesAt: poll.closesAt,
    options: poll.options.map((option) => ({
      id: option.id,
      label: option.label,
      votes: option._count.votes,
      selectedByMe: myOptionIds.has(option.id),
    })),
  });
}

