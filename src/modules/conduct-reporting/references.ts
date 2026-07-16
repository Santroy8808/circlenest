import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";

const REFERENCE_PREFIXES = ["INC", "RPT", "COM", "DSP", "RST", "RUN", "REV"] as const;

export type ConductReferencePrefix = (typeof REFERENCE_PREFIXES)[number];

export function createConductReference(prefix: ConductReferencePrefix, now = new Date()) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `${prefix}-${date}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function hashConductEvidence(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createConductFingerprint(parts: Array<string | null | undefined>) {
  return createHash("sha256")
    .update(parts.map((part) => part?.trim().toLowerCase() ?? "").join("\0"))
    .digest("hex");
}

export function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
