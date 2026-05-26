import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createStreamPost } from "@/modules/stream/stream.write.service";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const result = await createStreamPost(session.user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.post);
}
