import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { diagnostics } from "@/lib/platform/logging";
import { readJsonRequest } from "@/lib/platform/api-request";
import { createManuscript } from "@/modules/writers-corner/writers-corner.service";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  try {
    const body = await readJsonRequest(request);
    if (!body.ok) return body.response;

    const result = await createManuscript(session.user.id, body.value);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ manuscript: result.manuscript }, { status: 201 });
  } catch (error) {
    await diagnostics.error("writers-corner", "Could not create manuscript.", {
      userId: session.user.id,
      error: error instanceof Error ? error.message : "unknown"
    });
    return NextResponse.json({ error: "Could not create this manuscript right now. Please try again." }, { status: 500 });
  }
}
