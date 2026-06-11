import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

function fallbackRedirectPath(notificationType: string | null | undefined) {
  switch ((notificationType ?? "").trim()) {
    case "FRIEND_REQUEST":
      return "/friends#invites";
    case "NEW_MESSAGE":
    case "INBOX_MESSAGE":
      return "/messages";
    case "GROUP_ACTIVITY":
      return "/groups";
    case "NEW_COMMENT":
    case "NEW_REACTION":
      return "/home";
    case "BUSINESS_INQUIRY":
      return "/production-zone/business/storefront";
    case "ADMIN_ANNOUNCEMENT":
      return "/notifications";
    default:
      return "/notifications";
  }
}

function safeRedirectPath(targetUrl: string | null | undefined, notificationType: string | null | undefined) {
  if (!targetUrl) return fallbackRedirectPath(notificationType);
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
    select: { targetUrl: true, type: true },
  });
  if (!notification) return NextResponse.redirect(new URL("/notifications", request.url));

  await prisma.notification.updateMany({
    where: { id, userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.redirect(new URL(safeRedirectPath(notification.targetUrl, notification.type), request.url));
}

