import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { timeServerStep } from "@/lib/platform/server-timing";
import { listShellNoticeSummary } from "@/modules/notifications-alerts/notifications-alerts.service";

type SummaryType = "alerts" | "notifications";

function isSummaryType(value: string | null): value is SummaryType {
  return value === "alerts" || value === "notifications";
}

export async function GET(request: NextRequest) {
  const session = await timeServerStep("api.shell.summaries.auth", auth());

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ items: [] }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get("type");
  if (!isSummaryType(type)) {
    return NextResponse.json({ error: "type must be alerts or notifications." }, { status: 400 });
  }

  const activeActor = await timeServerStep("api.shell.summaries.actor", getActiveAccountActor(session.user.id));
  const items = await timeServerStep("api.shell.summaries.items", listShellNoticeSummary(activeActor.actorUserId, type));

  return NextResponse.json({
    items: items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString()
    }))
  });
}
