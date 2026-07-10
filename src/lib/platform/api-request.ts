import { NextResponse } from "next/server";
import { rateLimitHeaders } from "@/lib/platform/rate-limit";

const DEFAULT_JSON_BODY_LIMIT = 32 * 1024;

function requestTooLargeResponse() {
  return NextResponse.json(
    { error: "Request body is too large." },
    { status: 413, headers: { "cache-control": "no-store" } }
  );
}

export async function readTextRequest(request: Request, maxBytes: number) {
  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false as const, response: requestTooLargeResponse() };
  }

  if (!request.body) return { ok: true as const, value: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;

    receivedBytes += chunk.value.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false as const, response: requestTooLargeResponse() };
    }
    chunks.push(chunk.value);
  }

  const combined = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true as const, value: new TextDecoder().decode(combined) };
}

export async function readJsonRequest(request: Request, maxBytes = DEFAULT_JSON_BODY_LIMIT) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("+json")) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Send this request as JSON." },
        { status: 415, headers: { "cache-control": "no-store" } }
      )
    };
  }

  const body = await readTextRequest(request, maxBytes);
  if (!body.ok) return body;

  try {
    return { ok: true as const, value: JSON.parse(body.value) as unknown };
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Request body is not valid JSON." },
        { status: 400, headers: { "cache-control": "no-store" } }
      )
    };
  }
}

export function rateLimitedResponse(result: {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: Date;
}) {
  return NextResponse.json(
    { error: "Too many requests. Try again shortly." },
    {
      status: 429,
      headers: {
        ...rateLimitHeaders(result),
        "cache-control": "no-store"
      }
    }
  );
}
