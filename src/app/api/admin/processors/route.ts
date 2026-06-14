import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureBootstrapAdmins, isAdminUser, logAdminAction } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import {
  sanitizeProcessorConfigInput,
  seedDefaultStripeProcessorConfigs,
  serializePaymentProcessorConfig,
} from "@/lib/payments/processor-config";
import { adminModeLockedResponse } from "@/lib/security/admin-mode-guards";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const adminModeLocked = adminModeLockedResponse(session.user.id);
  if (adminModeLocked) return { error: adminModeLocked };
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return { error: locked };
  return { userId: session.user.id };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  await seedDefaultStripeProcessorConfigs(gate.userId);
  const configs = await prisma.paymentProcessorConfig.findMany({
    orderBy: [{ provider: "asc" }, { area: "asc" }, { mode: "asc" }],
    include: {
      updatedBy: { select: { id: true, username: true, email: true } },
      webhookEvents: { orderBy: { receivedAt: "desc" }, take: 5 },
    },
  });

  return NextResponse.json({
    boundary: "Secrets are never returned. This endpoint only reports configured env-var names and boolean presence checks.",
    configs: configs.map(serializePaymentProcessorConfig),
  });
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const data = sanitizeProcessorConfigInput(body);
  const config = await prisma.paymentProcessorConfig.upsert({
    where: { provider_area_mode: { provider: data.provider, area: data.area, mode: data.mode } },
    create: { ...data, updatedById: gate.userId },
    update: { ...data, updatedById: gate.userId },
    include: {
      updatedBy: { select: { id: true, username: true, email: true } },
      webhookEvents: { orderBy: { receivedAt: "desc" }, take: 5 },
    },
  });

  await logAdminAction({
    actorUserId: gate.userId,
    action: "UPSERT_PAYMENT_PROCESSOR_CONFIG",
    targetType: "PAYMENT_PROCESSOR_CONFIG",
    targetId: config.id,
    note: `${config.provider}/${config.area}/${config.mode} enabled=${config.isEnabled}`,
  });

  return NextResponse.json({ config: serializePaymentProcessorConfig(config) });
}
