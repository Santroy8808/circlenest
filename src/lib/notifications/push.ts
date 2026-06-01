import { prisma } from "@/lib/db/prisma";

type PushPayload = {
  title: string;
  body: string;
  url?: string;
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

export async function deliverPushNotification(userId: string, payload: PushPayload) {
  const activeSubs = await prisma.pushSubscription.findMany({
    where: { userId, enabled: true },
    select: { id: true },
  });
  if (activeSubs.length === 0) return;

  await sendViaWebhook(userId, payload);

  await prisma.pushSubscription.updateMany({
    where: { id: { in: activeSubs.map((sub) => sub.id) } },
    data: { lastSentAt: new Date() },
  });
}
