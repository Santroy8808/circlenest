export const ADMIN_NO_STORE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
} as const;

export type AdminRouteErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "REAUTHENTICATION_REQUIRED"
  | "TARGET_NOT_FOUND"
  | "VALIDATION_FAILED"
  | "INVALID_QUERY"
  | "VERSION_CONFLICT"
  | "COMMAND_ID_CONFLICT"
  | "COMMAND_FAILED";

export function adminRouteErrorStatus(code: AdminRouteErrorCode | string | undefined) {
  switch (code) {
    case "UNAUTHENTICATED":
      return 401;
    case "FORBIDDEN":
    case "REAUTHENTICATION_REQUIRED":
      return 403;
    case "TARGET_NOT_FOUND":
      return 404;
    case "VERSION_CONFLICT":
    case "COMMAND_ID_CONFLICT":
      return 409;
    case "COMMAND_FAILED":
      return 500;
    case "INVALID_QUERY":
    case "VALIDATION_FAILED":
    default:
      return 422;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function hasValidCommandId(value: unknown) {
  if (!isRecord(value) || typeof value.commandId !== "string") return false;
  const commandId = value.commandId.trim();
  return commandId.length >= 8 && commandId.length <= 200;
}

export function isValidExpectedVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function hasCompleteExpectedVersions(value: unknown, keys: readonly string[]) {
  return isRecord(value) && keys.every((key) => isValidExpectedVersion(value[key]));
}

export const ALLOWED_CONDUCT_ADMIN_COMMANDS = [
  "conduct-report.transition",
  "conduct-report.assign"
] as const;

export function isAllowedConductAdminCommand(value: unknown): value is (typeof ALLOWED_CONDUCT_ADMIN_COMMANDS)[number] {
  return typeof value === "string" && ALLOWED_CONDUCT_ADMIN_COMMANDS.some((command) => command === value);
}

export function adminHistoryQueryFromSearchParams(searchParams: URLSearchParams) {
  return Object.fromEntries(
    [...searchParams.entries()].filter(([, value]) => value.trim().length > 0)
  );
}
