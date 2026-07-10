import { rateLimitedResponse } from "@/lib/platform/api-request";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/platform/rate-limit";
import { getRequestContext } from "@/lib/platform/request-context";

type RequestRateLimitOptions = {
  namespace: string;
  limit: number;
  windowMs: number;
  identity?: string;
};

export type RequestRateLimitResult = Awaited<ReturnType<typeof consumeRateLimit>>;

function requestSourceKey(request: Request) {
  const context = getRequestContext(request);
  return context.ipAddress ?? `agent:${context.userAgent ?? "unknown"}`;
}

export function consumeRequestRateLimit(request: Request, options: RequestRateLimitOptions) {
  const identity = options.identity?.trim().slice(0, 256);

  return consumeRateLimit({
    namespace: options.namespace,
    key: `${identity ? `${identity}|` : ""}${requestSourceKey(request)}`,
    limit: options.limit,
    windowMs: options.windowMs
  });
}

export function withRateLimitHeaders<T extends Response>(response: T, result: RequestRateLimitResult) {
  for (const [name, value] of Object.entries(rateLimitHeaders(result))) {
    response.headers.set(name, value);
  }
  return response;
}

export function rateLimitExceededResponse(result: RequestRateLimitResult) {
  return rateLimitedResponse(result);
}
