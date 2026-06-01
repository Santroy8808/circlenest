import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

function safeRedirectPath(targetUrl: string | null | undefined) {
  if (!targetUrl) return "/notifications";
  if (!targetUrl.startsWith("/")) return "/notifications";
  if (targetUrl.startsWith("//")) return "/notifications";
  return targetUrl;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/login", request.url));

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) return NextResponse.redirect(new URL("/notifications", request.url));

  const notification = await prisma.notification.findFirst({
    where: { id, userId: session.user.id },
    select: { targetUrl: true },
  });
  if (!notification) return NextResponse.redirect(new URL("/notifications", request.url));

  await prisma.notification.updateMany({
    where: { id, userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.redirect(new URL(safeRedirectPath(notification.targetUrl), request.url));
}

