import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { searchChatContacts } from "@/modules/chat-messages/chat-messages.service";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const filter = request.nextUrl.searchParams.get("filter") ?? "ALL";
  return NextResponse.json({ people: await searchChatContacts(actor.actorUserId, query, filter) });
}
