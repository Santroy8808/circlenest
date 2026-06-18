import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { searchChatContacts } from "@/modules/chat-messages/chat-messages.service";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q") ?? "";
  return NextResponse.json({ people: await searchChatContacts(session.user.id, query) });
}
