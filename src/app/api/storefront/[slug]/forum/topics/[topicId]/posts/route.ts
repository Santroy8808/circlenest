import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createStorefrontForumPost } from "@/modules/storefront-forum/storefront-forum.service";

export async function POST(
  request: Request,
  props: { params: Promise<{ slug: string; topicId: string }> }
) {
  const params = await props.params;
  const session = await auth();

  if (session?.user?.revoked) {
    return NextResponse.json({ error: "Login session was revoked." }, { status: 401 });
  }

  const body = await request.json();
  const result = await createStorefrontForumPost(params.slug, params.topicId, session?.user?.id ?? null, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ post: result.post });
}
