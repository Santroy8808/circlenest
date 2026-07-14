import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireDeletePasswordFromRequest } from "@/lib/platform/delete-protection";
import { deleteStorefrontForumPost } from "@/modules/storefront-forum/storefront-forum.service";

export async function DELETE(request: Request, { params }: { params: { slug: string; postId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }
  const deletePasswordError = requireDeletePasswordFromRequest(request);
  if (deletePasswordError) return deletePasswordError;

  const result = await deleteStorefrontForumPost(params.slug, params.postId, session.user.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
