import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMembershipSubscriptionView } from "@/modules/membership-policy/subscription-view";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json(
      {
        error: "Login required.",
        code: "AUTHENTICATION_REQUIRED",
        recovery: "Sign in and open Membership again."
      },
      { status: 401, headers: { "cache-control": "no-store" } }
    );
  }

  const subscription = await getMembershipSubscriptionView(session.user.id);
  if (!subscription) {
    return NextResponse.json(
      {
        error: "Membership could not be found for this account.",
        code: "MEMBERSHIP_NOT_FOUND",
        recovery: "Sign out, sign back in, and try again."
      },
      { status: 404, headers: { "cache-control": "no-store" } }
    );
  }

  return NextResponse.json(
    { subscription },
    { headers: { "cache-control": "no-store" } }
  );
}
