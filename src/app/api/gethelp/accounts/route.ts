import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@/lib/platform/request-context";
import { createAuditorHelpAccount } from "@/modules/auditor-help/auditor-help.service";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = await createAuditorHelpAccount(body, getRequestContext(request));

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(
    {
      credentials: result.credentials,
      profileId: result.profileId
    },
    { status: 201 }
  );
}
