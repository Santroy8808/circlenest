import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { requestStorageArchiveDownload } from "@/modules/membership-policy/membership-storage-archive.service";

export async function POST(_request: NextRequest, props: { params: Promise<{ archiveId: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.revoked) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const userId = (await getActiveAccountActor(session.user.id)).actorUserId;
  const { archiveId } = await props.params;
  const result = await requestStorageArchiveDownload(userId, archiveId);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
