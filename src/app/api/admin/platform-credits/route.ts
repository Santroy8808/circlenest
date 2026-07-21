import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ADMIN_NO_STORE_HEADERS,
  isRecord
} from "@/app/api/admin/_shared/admin-route-contract";
import { readJsonRequest } from "@/lib/platform/api-request";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import { adjustPlatformCredits, findCreditAccount, getPlatformCreditsAdminView } from "@/modules/admin-moderation/platform-credits.service";

function creditFailure(error: string) {
  if (error === "User was not found.") return { status: 404, code: "TARGET_NOT_FOUND" } as const;
  if (error.includes("Admin access") || error.includes("protected")) {
    return { status: 403, code: "FORBIDDEN" } as const;
  }
  if (error.includes("idempotency key has already been used")) {
    return { status: 409, code: "COMMAND_ID_CONFLICT" } as const;
  }
  if (error.includes("negative") || error.includes("deactivated")) {
    return { status: 409, code: "VERSION_CONFLICT" } as const;
  }
  return { status: 422, code: "VALIDATION_FAILED" } as const;
}

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json(
      { error: "Login required.", code: "UNAUTHENTICATED" },
      { status: 401, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  if (!(await isAdminUser(session.user.id))) {
    return NextResponse.json(
      { error: "Admin access required.", code: "FORBIDDEN" },
      { status: 403, headers: ADMIN_NO_STORE_HEADERS }
    );
  }

  const identifier = request.nextUrl.searchParams.get("identifier");

  if (identifier) {
    return NextResponse.json({ account: await findCreditAccount(identifier) }, { headers: ADMIN_NO_STORE_HEADERS });
  }

  return NextResponse.json(await getPlatformCreditsAdminView(), { headers: ADMIN_NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json(
      { error: "Login required.", code: "UNAUTHENTICATED" },
      { status: 401, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  if (!(await isAdminUser(session.user.id))) {
    return NextResponse.json(
      { error: "Admin access required.", code: "FORBIDDEN" },
      { status: 403, headers: ADMIN_NO_STORE_HEADERS }
    );
  }

  const requestBody = await readJsonRequest(request, 16 * 1024);
  if (!requestBody.ok) return requestBody.response;
  const body = isRecord(requestBody.value) ? requestBody.value : {};
  const commandId = typeof body.commandId === "string"
    ? body.commandId.trim()
    : typeof body.idempotencyKey === "string"
      ? body.idempotencyKey.trim()
      : "";
  if (commandId.length < 8 || commandId.length > 160) {
    return NextResponse.json(
      { error: "Provide a command id of at least 8 characters.", code: "VALIDATION_FAILED", field: "commandId" },
      { status: 422, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  if (
    typeof body.commandId === "string" &&
    typeof body.idempotencyKey === "string" &&
    body.commandId.trim() !== body.idempotencyKey.trim()
  ) {
    return NextResponse.json(
      { error: "Command id and idempotency key must match when both are provided.", code: "VALIDATION_FAILED" },
      { status: 422, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  const result = await adjustPlatformCredits(session.user.id, { ...body, idempotencyKey: commandId });

  if (!result.ok) {
    const failure = creditFailure(result.error);
    return NextResponse.json(
      { error: result.error, code: failure.code },
      { status: failure.status, headers: ADMIN_NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      account: result.account,
      receipt: {
        commandId,
        ledgerEntryId: result.ledgerEntryId,
        replayed: result.replayed
      }
    },
    { headers: ADMIN_NO_STORE_HEADERS }
  );
}
