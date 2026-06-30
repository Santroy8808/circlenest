import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { lookupAdminObjectById } from "@/modules/admin-moderation/object-lookup.service";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const result = await lookupAdminObjectById(session.user.id, searchParams.get("q") ?? "");

  if (!result.canAccess) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  return NextResponse.json({ results: result.results });
}
