import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { auth } from "@/auth";
import { revokeUserSessions } from "@/modules/auth-security/auth-security.service";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked || session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json()) as { targetUserId?: string; reason?: string };

  if (!body.targetUserId) {
    return NextResponse.json({ error: "targetUserId is required." }, { status: 400 });
  }

  const result = await revokeUserSessions({
    actorUserId: session.user.id,
    targetUserId: body.targetUserId,
    reason: body.reason
  });

  return NextResponse.json(result);
}
