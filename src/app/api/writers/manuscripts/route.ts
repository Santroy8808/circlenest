import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createManuscript } from "@/modules/writers-corner/writers-corner.service";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const result = await createManuscript(session.user.id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ manuscript: result.manuscript }, { status: 201 });
}
