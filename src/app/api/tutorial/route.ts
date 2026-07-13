import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getWelcomeTutorialState, markWelcomeTutorialComplete } from "@/modules/tutorial/tutorial.service";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  return NextResponse.json(await getWelcomeTutorialState(session.user.id));
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  if (body.action !== "complete") {
    return NextResponse.json({ error: "Unsupported tutorial action." }, { status: 400 });
  }

  return NextResponse.json(await markWelcomeTutorialComplete(session.user.id));
}
