import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createGroupForUser } from "@/modules/groups/groups.service";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { name?: string; description?: string; visibility?: "PUBLIC" | "PRIVATE" };
  const result = await createGroupForUser(session.user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.group);
}
