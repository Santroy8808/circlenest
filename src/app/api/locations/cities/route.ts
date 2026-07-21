import { NextRequest, NextResponse } from "next/server";
import {
  CITY_LOCATION_MIN_QUERY_LENGTH,
  CITY_LOCATION_RECOMMENDED_DEBOUNCE_MS,
  searchCityLocations
} from "@/lib/platform/city-locations";
import { getCachedPlatformCityValues } from "@/modules/search-discovery/platform-city-values.service";

const RESPONSE_CACHE_HEADERS = {
  "cache-control": "public, max-age=60, stale-while-revalidate=600"
};

function responseHeaders(startedAt: number) {
  return {
    ...RESPONSE_CACHE_HEADERS,
    "server-timing": `location-typeahead;dur=${(performance.now() - startedAt).toFixed(2)}`
  };
}

export async function GET(request: NextRequest) {
  const startedAt = performance.now();
  const searchParams = request.nextUrl.searchParams;
  const query = (searchParams.get("q") ?? "").trim().slice(0, 80);
  const limit = Number(searchParams.get("limit") ?? "8");

  if (query.length < CITY_LOCATION_MIN_QUERY_LENGTH) {
    return NextResponse.json(
      {
        contract: {
          minQueryLength: CITY_LOCATION_MIN_QUERY_LENGTH,
          recommendedDebounceMs: CITY_LOCATION_RECOMMENDED_DEBOUNCE_MS
        },
        suggestions: []
      },
      { headers: responseHeaders(startedAt) }
    );
  }

  return NextResponse.json(
    {
      contract: {
        minQueryLength: CITY_LOCATION_MIN_QUERY_LENGTH,
        recommendedDebounceMs: CITY_LOCATION_RECOMMENDED_DEBOUNCE_MS
      },
      suggestions: searchCityLocations(
        query,
        Number.isFinite(limit) ? limit : 8,
        getCachedPlatformCityValues(query)
      )
    },
    { headers: responseHeaders(startedAt) }
  );
}
