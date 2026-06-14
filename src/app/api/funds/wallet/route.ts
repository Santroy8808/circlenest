import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getWalletSummary } from "@/lib/funds/ledger";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wallet = await getWalletSummary(session.user.id);
  return NextResponse.json({ wallet });
}
