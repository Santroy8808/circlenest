import { prisma } from "@/lib/db/prisma";

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  kind?: "notification" | "alert";
};

async function sendViaWebhook(userId: string, payload: PushPayload) {
  const webhook = process.env.PUSH_DELIVERY_WEBHOOK_URL?.trim();
  if (!webhook) return;
  await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, payload }),
  }).catch(() => null);
}

async function isPushEnabled(userId: string, kind: "notification" | "alert") {
  const pref = await prisma.userFeedPreference.findUnique({
    where: { userId },
    select: { notificationDingsEnabled: true, alertDingsEnabled: true },
  });
  if (!pref) return true;
  return kind === "alert" ? pref.alertDingsEnabled : pref.notificationDingsEnabled;
}

export async function deliverPushNotification(
  userId: string,
  payload: PushPayload,
  kind: "notification" | "alert" = "notification",
) {
  if (!(await isPushEnabled(userId, kind))) return;

  const activeSubs = await prisma.pushSubscription.findMany({
    where: { userId, enabled: true },
    select: { id: true },
  });
  if (activeSubs.length === 0) return;

  await sendViaWebhook(userId, { ...payload, kind });

  await prisma.pushSubscription.updateMany({
    where: { id: { in: activeSubs.map((sub) => sub.id) } },
    data: { lastSentAt: new Date() },
  });
}
