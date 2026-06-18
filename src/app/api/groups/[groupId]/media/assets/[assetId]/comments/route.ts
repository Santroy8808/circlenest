import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { commentOnGroupAsset } from "@/modules/group-media-docs/group-media-docs.service";

export async function POST(request: NextRequest, { params }: { params: { groupId: string; assetId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const result = await commentOnGroupAsset(session.user.id, params.groupId, params.assetId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ comment: result.comment }, { status: 201 });
}
