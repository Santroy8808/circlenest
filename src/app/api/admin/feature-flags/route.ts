import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ADMIN_NO_STORE_HEADERS,
  adminRouteErrorStatus,
  hasCompleteExpectedVersions,
  hasValidCommandId,
  isRecord,
  isValidExpectedVersion
} from "@/app/api/admin/_shared/admin-route-contract";
import { readJsonRequest } from "@/lib/platform/api-request";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import {
  FEATURE_FLAG_CATEGORIES,
  FEATURE_FLAG_DEFINITIONS,
  getFeatureFlagCategory,
  listRegisteredFeatureFlags,
  resetRegisteredFeatureFlag,
  setRegisteredFeatureFlagCategory,
  setRegisteredFeatureFlag
} from "@/modules/feature-flags/feature-flags.service";

async function getCatalog() {
  const flags = await listRegisteredFeatureFlags();
  return {
    catalogVersion: 1,
    categories: FEATURE_FLAG_CATEGORIES.map((category) => {
      const categoryFlags = flags.filter((flag) => flag.categoryKey === category.key);
      const enabledCount = categoryFlags.filter((flag) => flag.enabled).length;
      return {
        ...category,
        state: enabledCount === 0 ? "disabled" : enabledCount === categoryFlags.length ? "enabled" : "mixed",
        enabledCount,
        featureCount: categoryFlags.length,
        expectedVersions: Object.fromEntries(categoryFlags.map((flag) => [flag.key, flag.version])),
        flags: categoryFlags
      };
    }),
    flags
  };
}

export async function GET() {
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
  return NextResponse.json(await getCatalog(), { headers: ADMIN_NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
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

  const body = await readJsonRequest(request, 16 * 1024);
  if (!body.ok) return body.response;
  const value = isRecord(body.value) ? body.value : {};
  if (!hasValidCommandId(value)) {
    return NextResponse.json(
      { error: "Provide a command id of at least 8 characters.", code: "VALIDATION_FAILED", field: "commandId" },
      { status: 422, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  if (value.action !== "set" && value.action !== "reset" && value.action !== "set-category") {
    return NextResponse.json(
      { error: "Choose set, reset, or set-category.", code: "VALIDATION_FAILED", field: "action" },
      { status: 422, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  if (value.action === "set" || value.action === "reset") {
    if (!isValidExpectedVersion(value.expectedVersion)) {
      return NextResponse.json(
        { error: "Provide the feature's current version.", code: "VALIDATION_FAILED", field: "expectedVersion" },
        { status: 422, headers: ADMIN_NO_STORE_HEADERS }
      );
    }
  } else {
    const category = getFeatureFlagCategory(value.categoryKey);
    const categoryDefinitions = category
      ? FEATURE_FLAG_DEFINITIONS.filter((definition) => definition.categoryKey === category.key)
      : [];
    const hasEveryVersion = Boolean(
      category &&
      hasCompleteExpectedVersions(value.expectedVersions, categoryDefinitions.map((definition) => definition.key))
    );
    if (!hasEveryVersion) {
      return NextResponse.json(
        {
          error: "Provide the current version of every feature in this category.",
          code: "VALIDATION_FAILED",
          field: "expectedVersions"
        },
        { status: 422, headers: ADMIN_NO_STORE_HEADERS }
      );
    }
  }
  const result = value.action === "reset"
    ? await resetRegisteredFeatureFlag(session.user.id, value)
    : value.action === "set-category"
      ? await setRegisteredFeatureFlagCategory(session.user.id, value)
      : await setRegisteredFeatureFlag(session.user.id, value);

  if (!result.ok) {
    const code = result.code ?? "VALIDATION_FAILED";
    return NextResponse.json(
      { error: result.error, code },
      { status: adminRouteErrorStatus(code), headers: ADMIN_NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      receipt: {
        commandId: result.commandId,
        auditLogId: result.auditLogId,
        replayed: result.replayed
      },
      ...(await getCatalog())
    },
    { headers: ADMIN_NO_STORE_HEADERS }
  );
}
