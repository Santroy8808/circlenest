import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateManuscriptStorefrontPublishing } from "@/modules/writers-corner/writers-corner.service";

export async function PATCH(request: Request, { params }: { params: { manuscriptId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const result = await updateManuscriptStorefrontPublishing(session.user.id, params.manuscriptId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ manuscript: result.manuscript });
}
