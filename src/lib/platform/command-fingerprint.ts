import { createHash } from "node:crypto";

export type CommandFingerprintInput = {
  actorUserId: string;
  action: string;
  target: {
    type: string;
    id: string;
  };
  payload: unknown;
};

type AuditCommandIdentity = {
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
};

function canonicalJson(value: unknown, seen: Set<object>): string {
  if (value === null) return "null";
  if (value === undefined) return '{"$undefined":true}';
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Command fingerprints require finite numbers.");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError("Command fingerprints require valid dates.");
    return `{"$date":${JSON.stringify(value.toISOString())}}`;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError("Command fingerprints do not support circular values.");
    seen.add(value);
    const result = `[${value.map((entry) => canonicalJson(entry, seen)).join(",")}]`;
    seen.delete(value);
    return result;
  }
  if (typeof value === "object") {
    if (seen.has(value)) throw new TypeError("Command fingerprints do not support circular values.");
    seen.add(value);
    const record = value as Record<string, unknown>;
    const result = `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key], seen)}`)
      .join(",")}}`;
    seen.delete(value);
    return result;
  }
  throw new TypeError(`Command fingerprints do not support ${typeof value} values.`);
}

export function createCommandFingerprint(input: CommandFingerprintInput) {
  return createHash("sha256").update(canonicalJson(input, new Set()), "utf8").digest("hex");
}

export function isMatchingCommandFingerprint(
  audit: AuditCommandIdentity,
  expected: Omit<CommandFingerprintInput, "payload"> & { fingerprint: string }
) {
  const metadata = audit.metadata;
  const storedFingerprint =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).commandFingerprint
      : undefined;

  return (
    audit.actorUserId === expected.actorUserId &&
    audit.action === expected.action &&
    audit.targetType === expected.target.type &&
    audit.targetId === expected.target.id &&
    storedFingerprint === expected.fingerprint
  );
}
