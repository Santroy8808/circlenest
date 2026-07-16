import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireDeletePasswordFromBodyOrRequest } from "@/lib/platform/delete-protection";
import {
  createBulkMemberInvites,
  createMemberFreeAccountInviteCode,
  listOwnBulkInviteBatches,
  listOwnFreeAccountInvites,
  revokeOwnFreeAccountInviteCode
} from "@/modules/membership-policy/free-account-invites.service";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const [invites, bulkBatches] = await Promise.all([
    listOwnFreeAccountInvites(session.user.id),
    listOwnBulkInviteBatches(session.user.id)
  ]);
  return NextResponse.json({ invites, bulkBatches });
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const result = body?.action === "bulk"
    ? await createBulkMemberInvites(session.user.id, body)
    : await createMemberFreeAccountInviteCode(session.user.id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (body?.action === "bulk") {
    if (!("batch" in result)) return NextResponse.json({ error: "Could not queue bulk invitations." }, { status: 400 });
    return NextResponse.json({
      batch: result.batch,
      queuedCount: result.queuedCount,
      dailyCap: result.dailyCap,
      intervalMinutes: result.intervalMinutes,
      invites: await listOwnFreeAccountInvites(session.user.id),
      bulkBatches: await listOwnBulkInviteBatches(session.user.id)
    });
  }

  if (!("inviteCode" in result) || !("invite" in result)) return NextResponse.json({ error: "Could not generate invite." }, { status: 400 });

  return NextResponse.json({
    inviteCode: result.inviteCode,
    invite: result.invite,
    invites: await listOwnFreeAccountInvites(session.user.id),
    bulkBatches: await listOwnBulkInviteBatches(session.user.id),
  });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const deletePasswordError = requireDeletePasswordFromBodyOrRequest(body, request);
  if (deletePasswordError) return deletePasswordError;

  const result = await revokeOwnFreeAccountInviteCode(session.user.id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ invites: await listOwnFreeAccountInvites(session.user.id), bulkBatches: await listOwnBulkInviteBatches(session.user.id) });
}
