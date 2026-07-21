import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma, UserRole } from "@prisma/client";
import { createCommandFingerprint } from "@/lib/platform/command-fingerprint";
import { prisma } from "@/lib/platform/db";

const REAUTH_MODULE = "stripe-admin-reauth";
const REAUTH_TTL_MS = 60_000;

export type StripeAdminMutationKind = "connection" | "subscription-price" | "credit-package";
export type StripeAdminReauthenticationProof = { id: string; secret: string };

type StripeAdminSecuritySnapshot = {
  id: string;
  role: UserRole;
  deactivatedAt: Date | null;
  passwordHash: string | null;
  sessionVersion: number;
  lastPasswordChangedAt: Date | null;
};

type ProofRecord = {
  id: string;
  actorUserId: string | null;
  module: string;
  actionKey: string;
  status: string;
  metadata: Prisma.JsonValue;
};

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function jsonRecord(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : null;
}

export function createStripeAdminReauthenticationBinding(input: {
  actorUserId: string;
  kind: StripeAdminMutationKind;
  validatedPayload: Record<string, unknown>;
}) {
  const commandId = typeof input.validatedPayload.commandId === "string"
    ? input.validatedPayload.commandId
    : "invalid-command";
  return createCommandFingerprint({
    actorUserId: input.actorUserId,
    action: `stripe.reauthentication.${input.kind}`,
    target: { type: "StripeAdminCommand", id: commandId },
    payload: input.validatedPayload
  });
}

export async function issueStripeAdminReauthenticationProof(input: {
  actor: StripeAdminSecuritySnapshot;
  kind: StripeAdminMutationKind;
  validatedPayload: Record<string, unknown>;
}) {
  const secret = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + REAUTH_TTL_MS);
  const binding = createStripeAdminReauthenticationBinding({
    actorUserId: input.actor.id,
    kind: input.kind,
    validatedPayload: input.validatedPayload
  });
  const proof = await prisma.adminAction.create({
    data: {
      actorUserId: input.actor.id,
      actionKey: input.kind,
      module: REAUTH_MODULE,
      status: "pending",
      metadata: {
        binding,
        commandId: input.validatedPayload.commandId as string,
        expiresAt: expiresAt.toISOString(),
        secretHash: sha256(secret),
        sessionVersion: input.actor.sessionVersion,
        lastPasswordChangedAt: input.actor.lastPasswordChangedAt?.toISOString() ?? null,
        passwordHashFingerprint: input.actor.passwordHash ? sha256(input.actor.passwordHash) : null
      } as Prisma.InputJsonObject
    }
  });
  return { id: proof.id, secret } satisfies StripeAdminReauthenticationProof;
}

export function validateStripeAdminReauthenticationSnapshot(input: {
  actor: StripeAdminSecuritySnapshot | null;
  proof: ProofRecord | null;
  presentedProof: StripeAdminReauthenticationProof;
  kind: StripeAdminMutationKind;
  binding: string;
  now?: Date;
}) {
  const actor = input.actor;
  if (!actor || actor.deactivatedAt || actor.role !== UserRole.GOD || !actor.passwordHash) {
    return { ok: false as const, error: "God access is required to change payment configuration." };
  }
  const proof = input.proof;
  const metadata = proof ? jsonRecord(proof.metadata) : null;
  if (
    !proof ||
    proof.id !== input.presentedProof.id ||
    proof.actorUserId !== actor.id ||
    proof.module !== REAUTH_MODULE ||
    proof.actionKey !== input.kind ||
    proof.status !== "pending" ||
    !metadata
  ) {
    return { ok: false as const, error: "God password confirmation is missing or has already been used." };
  }
  const expiresAt = typeof metadata.expiresAt === "string" ? new Date(metadata.expiresAt) : null;
  const lastPasswordChangedAt = actor.lastPasswordChangedAt?.toISOString() ?? null;
  const securityMatches =
    metadata.sessionVersion === actor.sessionVersion &&
    metadata.lastPasswordChangedAt === lastPasswordChangedAt &&
    metadata.passwordHashFingerprint === sha256(actor.passwordHash);
  const secretMatches =
    typeof metadata.secretHash === "string" &&
    secureEqual(metadata.secretHash, sha256(input.presentedProof.secret));
  if (
    metadata.binding !== input.binding ||
    !expiresAt ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt <= (input.now ?? new Date()) ||
    !securityMatches ||
    !secretMatches
  ) {
    return { ok: false as const, error: "God password confirmation expired or no longer matches this command." };
  }
  return { ok: true as const };
}

export class StripeAdminReauthenticationError extends Error {}

export async function consumeStripeAdminReauthenticationProof(
  transaction: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    proof: StripeAdminReauthenticationProof;
    kind: StripeAdminMutationKind;
    validatedPayload: Record<string, unknown>;
  }
) {
  await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${input.actorUserId} FOR UPDATE`
  );
  await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "AdminAction" WHERE "id" = ${input.proof.id} FOR UPDATE`
  );
  const [actor, proof] = await Promise.all([
    transaction.user.findUnique({
      where: { id: input.actorUserId },
      select: {
        id: true,
        role: true,
        deactivatedAt: true,
        passwordHash: true,
        sessionVersion: true,
        lastPasswordChangedAt: true
      }
    }),
    transaction.adminAction.findUnique({
      where: { id: input.proof.id },
      select: { id: true, actorUserId: true, module: true, actionKey: true, status: true, metadata: true }
    })
  ]);
  const binding = createStripeAdminReauthenticationBinding({
    actorUserId: input.actorUserId,
    kind: input.kind,
    validatedPayload: input.validatedPayload
  });
  const validation = validateStripeAdminReauthenticationSnapshot({
    actor,
    proof,
    presentedProof: input.proof,
    kind: input.kind,
    binding
  });
  if (!validation.ok) throw new StripeAdminReauthenticationError(validation.error);
  const consumed = await transaction.adminAction.updateMany({
    where: { id: input.proof.id, status: "pending" },
    data: { status: "consumed" }
  });
  if (consumed.count !== 1) {
    throw new StripeAdminReauthenticationError("God password confirmation has already been used.");
  }
}
