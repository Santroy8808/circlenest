import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { diagnostics } from "@/lib/platform/logging";
import { readJsonRequest } from "@/lib/platform/api-request";
import { updateManuscriptStorefrontPublishing } from "@/modules/writers-corner/writers-corner.service";

export async function PATCH(request: Request, { params }: { params: { manuscriptId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  try {
    const body = await readJsonRequest(request);
    if (!body.ok) return body.response;

    const result = await updateManuscriptStorefrontPublishing(session.user.id, params.manuscriptId, body.value);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ manuscript: result.manuscript });
  } catch (error) {
    await diagnostics.error("writers-corner", "Could not update manuscript storefront publishing.", {
      userId: session.user.id,
      manuscriptId: params.manuscriptId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return NextResponse.json({ error: "Could not update this manuscript right now. Please try again." }, { status: 500 });
  }
}
