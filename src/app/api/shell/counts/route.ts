import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { timeServerStep } from "@/lib/platform/server-timing";
import { getUnreadCounts } from "@/modules/notifications-alerts/notifications-alerts.service";

const zeroCounts = { alerts: 0, mail: 0, messages: 0, notifications: 0 };

export async function GET() {
  const session = await timeServerStep("api.shell.counts.auth", auth());

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ counts: zeroCounts }, { status: 401 });
  }

  const activeActor = await timeServerStep("api.shell.counts.actor", getActiveAccountActor(session.user.id));
  const counts = await timeServerStep("api.shell.counts.unread", getUnreadCounts(activeActor.actorUserId));

  return NextResponse.json({ counts });
}
