import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { respondToFriendRelationshipRequest } from "@/modules/social-graph/social-graph.service";

export async function POST(request: NextRequest, { params }: { params: { requestId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const result = await respondToFriendRelationshipRequest(session.user.id, params.requestId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ status: result.status });
}
