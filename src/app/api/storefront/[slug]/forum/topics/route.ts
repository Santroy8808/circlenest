import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createStorefrontForumTopic,
  listStorefrontForumTopics
} from "@/modules/storefront-forum/storefront-forum.service";

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const session = await auth();
  const result = await listStorefrontForumTopics(params.slug, {
    query: request.nextUrl.searchParams.get("q") ?? "",
    viewerUserId: session?.user && !session.user.revoked ? session.user.id : null
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ forum: result.forum });
}

export async function POST(request: Request, { params }: { params: { slug: string } }) {
  const session = await auth();

  if (session?.user?.revoked) {
    return NextResponse.json({ error: "Login session was revoked." }, { status: 401 });
  }

  const body = await request.json();
  const result = await createStorefrontForumTopic(params.slug, session?.user?.id ?? null, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ topic: result.topic });
}
