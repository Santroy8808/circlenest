import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteStorefrontForumTopic } from "@/modules/storefront-forum/storefront-forum.service";

export async function DELETE(_request: Request, { params }: { params: { slug: string; topicId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const result = await deleteStorefrontForumTopic(params.slug, params.topicId, session.user.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
