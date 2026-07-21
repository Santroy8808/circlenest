import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ADMIN_NO_STORE_HEADERS,
  isRecord
} from "@/app/api/admin/_shared/admin-route-contract";
import { readJsonRequest, rateLimitedResponse } from "@/lib/platform/api-request";
import { prisma } from "@/lib/platform/db";
import { consumeRateLimit } from "@/lib/platform/rate-limit";
import { isGodRole } from "@/lib/platform/roles";
import { verifyPassword } from "@/modules/auth-security/password";
import {
  getStripeSetupAdminView,
  stripeConnectionSchema,
  stripeCreditPackageSchema,
  stripeSubscriptionPriceSchema,
  updateStripeConnection,
  updateStripeSubscriptionPrice,
  upsertStripeCreditPackage
} from "@/modules/billing/stripe-admin.service";
import {
  issueStripeAdminReauthenticationProof,
  type StripeAdminMutationKind
} from "@/modules/billing/stripe-admin-reauth.service";

async function getActiveGod(userId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      deactivatedAt: true,
      passwordHash: true,
      sessionVersion: true,
      lastPasswordChangedAt: true
    }
  });
  return actor && !actor.deactivatedAt && isGodRole(actor.role) ? actor : null;
}

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json(
      { error: "Login required.", code: "UNAUTHENTICATED" },
      { status: 401, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  if (!(await getActiveGod(session.user.id))) {
    return NextResponse.json(
      { error: "God access is required to view payment configuration.", code: "FORBIDDEN" },
      { status: 403, headers: ADMIN_NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(await getStripeSetupAdminView(), { headers: ADMIN_NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json(
      { error: "Login required.", code: "UNAUTHENTICATED" },
      { status: 401, headers: ADMIN_NO_STORE_HEADERS }
    );
  }

  const requestBody = await readJsonRequest(request, 32 * 1024);
  if (!requestBody.ok) return requestBody.response;
  const body = isRecord(requestBody.value) ? requestBody.value : {};
  const actor = await getActiveGod(session.user.id);
  if (!actor) {
    return NextResponse.json(
      { error: "God access is required to change payment configuration.", code: "FORBIDDEN" },
      { status: 403, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  const kind = body.action === "connection" || body.action === "subscription-price" || body.action === "credit-package"
    ? body.action satisfies StripeAdminMutationKind
    : null;
  if (!kind) {
    return NextResponse.json(
      { error: "Choose a valid Stripe setup action.", code: "VALIDATION_FAILED", field: "action" },
      { status: 422, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  const rawPayload = isRecord(body.payload) ? body.payload : {};
  const parsedPayload = kind === "connection"
    ? stripeConnectionSchema.safeParse(rawPayload)
    : kind === "subscription-price"
      ? stripeSubscriptionPriceSchema.safeParse(rawPayload)
      : stripeCreditPackageSchema.safeParse(rawPayload);
  if (!parsedPayload.success) {
    return NextResponse.json(
      {
        error: parsedPayload.error.issues[0]?.message ?? "Invalid Stripe administrator command.",
        code: "VALIDATION_FAILED",
        field: `payload.${parsedPayload.error.issues[0]?.path.join(".") || "command"}`
      },
      { status: 422, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  const payload = parsedPayload.data as Record<string, unknown>;

  const password = typeof body.password === "string" ? body.password : "";
  if (!password || password.length > 1024) {
    return NextResponse.json(
      { error: "Confirm the God account password before changing payment configuration.", code: "REAUTHENTICATION_REQUIRED" },
      { status: 403, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  const reauthenticationLimit = await consumeRateLimit({
    namespace: "admin:stripe-reauthentication",
    key: actor.id,
    limit: 10,
    windowMs: 15 * 60 * 1000
  });
  if (!reauthenticationLimit.allowed) return rateLimitedResponse(reauthenticationLimit);
  if (!actor.passwordHash || !(await verifyPassword(password, actor.passwordHash))) {
    return NextResponse.json(
      { error: "Password confirmation failed.", code: "REAUTHENTICATION_REQUIRED" },
      { status: 403, headers: ADMIN_NO_STORE_HEADERS }
    );
  }

  const reauthenticationProof = await issueStripeAdminReauthenticationProof({
    actor,
    kind,
    validatedPayload: payload
  });
  let result:
    | Awaited<ReturnType<typeof updateStripeConnection>>
    | Awaited<ReturnType<typeof updateStripeSubscriptionPrice>>
    | Awaited<ReturnType<typeof upsertStripeCreditPackage>>;

  if (kind === "connection") {
    result = await updateStripeConnection(session.user.id, payload, reauthenticationProof);
  } else if (kind === "subscription-price") {
    result = await updateStripeSubscriptionPrice(session.user.id, payload, reauthenticationProof);
  } else {
    result = await upsertStripeCreditPackage(session.user.id, payload, reauthenticationProof);
  }

  if (!result.ok) {
    const status = result.error.includes("command id has already been used")
      ? 409
      : result.error.includes("God access") || result.error.includes("password confirmation")
        ? 403
        : 422;
    return NextResponse.json(
      {
        error: result.error,
        code: status === 409 ? "COMMAND_ID_CONFLICT" : status === 403 ? "FORBIDDEN" : "VALIDATION_FAILED"
      },
      { status, headers: ADMIN_NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      view: result.view,
      receipt: {
        commandId: payload.commandId,
        replayed: result.replayed
      }
    },
    { headers: ADMIN_NO_STORE_HEADERS }
  );
}
