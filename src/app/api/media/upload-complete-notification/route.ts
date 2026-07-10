import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import { prisma } from "@/lib/platform/db";

const uploadCompleteNotificationSchema = z.object({
  uploaded: z.number().int().min(0).max(500),
  failed: z.number().int().min(0).max(500)
});

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const requestBody = await readJsonRequest(request);
  if (!requestBody.ok) return requestBody.response;

  const parsed = uploadCompleteNotificationSchema.safeParse(requestBody.value);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload completion payload." }, { status: 400 });
  }

  if (parsed.data.uploaded === 0 && parsed.data.failed === 0) {
    return NextResponse.json({ ok: true });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const title = parsed.data.failed > 0 ? "Gallery upload finished with errors" : "Gallery upload complete";
  const notificationBody =
    parsed.data.failed > 0
      ? `${parsed.data.uploaded} uploaded, ${parsed.data.failed} failed.`
      : `${parsed.data.uploaded} photo${parsed.data.uploaded === 1 ? "" : "s"} uploaded to your gallery.`;

  await prisma.notification.create({
    data: {
      userId: actor.actorUserId,
      title,
      body: notificationBody,
      href: "/profile/gallery"
    }
  });

  return NextResponse.json({ ok: true });
}
