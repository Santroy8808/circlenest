import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { subject?: string; details?: string };
  const subject = String(body.subject ?? "").trim();
  const details = String(body.details ?? "").trim();
  if (!subject || !details) return NextResponse.json({ error: "subject and details are required" }, { status: 400 });
  const petition = await prisma.adminPetition.create({
    data: {
      requesterId: session.user.id,
      subject,
      details,
    },
  });
  return NextResponse.json(petition);
}

