import { NextResponse } from "next/server";

type UploadIntentFailureLike = {
  error: string;
  code?: string;
  retryAfterSeconds?: number;
};

export function uploadIntentFailureResponse(result: UploadIntentFailureLike) {
  const status =
    result.code === "RATE_LIMITED"
      ? 429
      : result.code === "STORAGE_UNAVAILABLE"
        ? 503
        : result.code === "NOT_FOUND"
          ? 404
          : result.code === "OBJECT_REJECTED"
            ? 422
            : ["CONFLICT", "EXPIRED", "REVOKED", "ALREADY_USED", "NOT_VERIFIED"].includes(result.code ?? "")
              ? 409
              : 400;

  return NextResponse.json(
    { error: result.error, code: result.code },
    {
      status,
      headers: {
        "cache-control": "no-store",
        ...(result.retryAfterSeconds
          ? { "retry-after": String(Math.max(1, Math.ceil(result.retryAfterSeconds))) }
          : {})
      }
    }
  );
}
