import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import {
  createChapter,
  createManuscript,
  getWriterAccessState,
  safeGetChapterDetail,
  safeGetManuscriptDetail,
  safeListManuscripts
} from "@/modules/writers-corner/writers-corner.service";

export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const chapterId = request.nextUrl.searchParams.get("chapterId");
  if (chapterId) {
    const result = await safeGetChapterDetail(session.user.id, chapterId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ chapter: result.chapter });
  }

  const manuscriptId = request.nextUrl.searchParams.get("manuscriptId");
  if (manuscriptId) {
    const result = await safeGetManuscriptDetail(session.user.id, manuscriptId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ manuscript: result.manuscript });
  }

  return NextResponse.json({
    access: await getWriterAccessState(session.user.id),
    manuscripts: await safeListManuscripts(session.user.id)
  });
}

export async function POST(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const result = body.manuscriptId
    ? await createChapter(session.user.id, body.manuscriptId, body)
    : await createManuscript(session.user.id, body);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
