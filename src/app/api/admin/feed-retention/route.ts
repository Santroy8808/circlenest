import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest } from "@/lib/platform/api-request";
import {
  applyPublicStreamRetentionPolicy,
  exportFeedThread,
  holdFeedThread,
  importFeedThread,
  releaseFeedThreadHold,
  searchAdminFeedThreads
} from "@/modules/feed-stream/feed-retention.service";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const result = await searchAdminFeedThreads(session.user.id, {
    query: request.nextUrl.searchParams.get("query") ?? "",
    limit: request.nextUrl.searchParams.get("limit") ?? "20",
    includeArchived: request.nextUrl.searchParams.get("includeArchived") ?? "true",
    includeDeleted: request.nextUrl.searchParams.get("includeDeleted") ?? "true",
    heldOnly: request.nextUrl.searchParams.get("heldOnly") ?? "false"
  });

  return result.ok
    ? NextResponse.json(result)
    : NextResponse.json({ error: result.error }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await readJsonRequest(request, 5 * 1024 * 1024);
  if (!body.ok) return body.response;

  const value = body.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const action = (value as { action?: unknown }).action;
  const payload = (value as { payload?: unknown }).payload ?? value;

  let result;
  if (action === "apply-policy") {
    result = await applyPublicStreamRetentionPolicy(session.user.id);
  } else if (action === "hold-post") {
    result = await holdFeedThread(session.user.id, payload);
  } else if (action === "release-hold") {
    result = await releaseFeedThreadHold(session.user.id, payload);
  } else if (action === "export-thread") {
    result = await exportFeedThread(session.user.id, payload);
  } else if (action === "import-thread") {
    result = await importFeedThread(session.user.id, payload);
  } else {
    return NextResponse.json({ error: "Unsupported feed retention action." }, { status: 400 });
  }

  return result.ok
    ? NextResponse.json(result)
    : NextResponse.json({ error: result.error }, { status: 400 });
}
