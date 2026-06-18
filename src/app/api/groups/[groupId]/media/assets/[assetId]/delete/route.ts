import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteGroupAsset } from "@/modules/group-media-docs/group-media-docs.service";

export async function POST(_request: Request, { params }: { params: { groupId: string; assetId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const result = await deleteGroupAsset(session.user.id, params.groupId, params.assetId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
