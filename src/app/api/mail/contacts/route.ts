import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { searchMailContacts } from "@/modules/mail/mail.service";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q") ?? "";
  return NextResponse.json({ people: await searchMailContacts(session.user.id, query) });
}
