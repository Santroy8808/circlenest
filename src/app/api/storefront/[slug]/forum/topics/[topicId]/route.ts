import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireDeletePasswordFromRequest } from "@/lib/platform/delete-protection";
import { deleteStorefrontForumTopic } from "@/modules/storefront-forum/storefront-forum.service";

export async function DELETE(request: Request, { params }: { params: { slug: string; topicId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }
  const deletePasswordError = requireDeletePasswordFromRequest(request);
  if (deletePasswordError) return deletePasswordError;

  const result = await deleteStorefrontForumTopic(params.slug, params.topicId, session.user.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
