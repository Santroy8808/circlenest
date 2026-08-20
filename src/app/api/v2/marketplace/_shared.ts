import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { readJsonRequest } from "@/lib/platform/api-request";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";

export async function requireMarketplaceRollout() {
  return (await isFeatureEnabled("marketplace.focused_rollout"))
    ? null
    : NextResponse.json({ error: "Marketplace is not available." }, { status: 404 });
}

export async function marketplaceSessionUser() {
  const session = await auth();
  return session?.user && !session.user.revoked ? session.user : null;
}

export function marketplaceLoginRequired() {
  return NextResponse.json({ error: "Login required." }, { status: 401 });
}

export async function marketplaceJsonBody(request: NextRequest) {
  return readJsonRequest(request);
}

function optionalNumber(value: string | null) {
  if (value == null || value === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : value;
}

function optionalBoolean(value: string | null) {
  if (value == null || value === "") return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return value;
}

export function marketplaceSearchFromParams(params: URLSearchParams) {
  const facets: Record<string, string | number | boolean | string[]> = {};
  for (const [key, value] of params.entries()) {
    if (!key.startsWith("facet.")) continue;
    const facetKey = key.slice("facet.".length);
    const values = params.getAll(key);
    facets[facetKey] = values.length > 1 ? values : value;
  }
  return {
    q: params.get("q") || undefined,
    kind: params.get("kind") || undefined,
    intent: params.get("intent") || undefined,
    category: params.get("category") || undefined,
    subcategory: params.get("subcategory") || undefined,
    countryCode: params.get("country") || undefined,
    region: params.get("region") || undefined,
    city: params.get("city") || undefined,
    remote: optionalBoolean(params.get("remote")),
    minPriceCents: optionalNumber(params.get("minPriceCents")),
    maxPriceCents: optionalNumber(params.get("maxPriceCents")),
    sort: params.get("sort") || undefined,
    cursor: params.get("cursor") || undefined,
    limit: optionalNumber(params.get("limit")),
    facets,
  };
}

export function marketplaceResult<T extends { ok: boolean; error?: string }>(result: T, successStatus = 200) {
  return result.ok
    ? NextResponse.json(result, { status: successStatus })
    : NextResponse.json({ error: result.error ?? "Marketplace request failed." }, { status: 400 });
}
