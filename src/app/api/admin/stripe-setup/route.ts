import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import {
  getStripeSetupAdminView,
  updateStripeConnection,
  updateStripeSubscriptionPrice,
  upsertStripeCreditPackage
} from "@/modules/billing/stripe-admin.service";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.revoked || !(await isAdminUser(session.user.id))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  return NextResponse.json(await getStripeSetupAdminView());
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { action?: string; payload?: unknown } | null;
  let result:
    | Awaited<ReturnType<typeof updateStripeConnection>>
    | Awaited<ReturnType<typeof updateStripeSubscriptionPrice>>
    | Awaited<ReturnType<typeof upsertStripeCreditPackage>>;

  if (body?.action === "connection") {
    result = await updateStripeConnection(session.user.id, body.payload);
  } else if (body?.action === "subscription-price") {
    result = await updateStripeSubscriptionPrice(session.user.id, body.payload);
  } else if (body?.action === "credit-package") {
    result = await upsertStripeCreditPackage(session.user.id, body.payload);
  } else {
    return NextResponse.json({ error: "Choose a valid Stripe setup action." }, { status: 400 });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ view: result.view });
}
