import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getLinkPreview, isLinkPreviewUrlAllowed } from "@/modules/link-preview/link-preview.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const url = request.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (!isLinkPreviewUrlAllowed(url)) {
    return NextResponse.json({ error: "This link cannot be previewed." }, { status: 400 });
  }

  const preview = await getLinkPreview(url);
  return NextResponse.json(
    { preview },
    {
      headers: {
        "Cache-Control": "private, max-age=900"
      }
    }
  );
}
