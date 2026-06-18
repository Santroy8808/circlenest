import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateChapter } from "@/modules/writers-corner/writers-corner.service";

export async function PATCH(request: Request, { params }: { params: { chapterId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const result = await updateChapter(session.user.id, params.chapterId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ chapter: result.chapter });
}
