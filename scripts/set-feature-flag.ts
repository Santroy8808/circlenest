import { prisma } from "../src/lib/platform/db";
import { setRegisteredFeatureFlag } from "../src/modules/feature-flags/feature-flags.service";

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function usage() {
  console.log(
    "Usage: npx tsx scripts/set-feature-flag.ts --confirm --actor-email=<email> --key=<flag> --enabled=<true|false> --expected-version=<number> --reason=<reason> [--command-id=<id>]"
  );
}

async function main() {
  if (process.argv.includes("--help")) {
    usage();
    return;
  }
  if (!process.argv.includes("--confirm")) throw new Error("Pass --confirm to apply a feature-flag change.");

  const actorEmail = argument("actor-email")?.trim().toLowerCase();
  const key = argument("key")?.trim();
  const enabledValue = argument("enabled")?.trim().toLowerCase();
  const expectedVersionValue = argument("expected-version")?.trim();
  const reason = argument("reason")?.trim();
  const commandId = argument("command-id")?.trim();
  if (!actorEmail || !key || !reason || !expectedVersionValue) throw new Error("Provide actor, key, expected version, and reason.");
  if (enabledValue !== "true" && enabledValue !== "false") throw new Error("Enabled must be true or false.");
  const expectedVersion = Number(expectedVersionValue);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw new Error("Expected version must be a non-negative integer.");

  const actor = await prisma.user.findFirst({
    where: { email: { equals: actorEmail, mode: "insensitive" } },
    select: { id: true }
  });
  if (!actor) throw new Error("The requested feature-flag actor was not found.");

  const result = await setRegisteredFeatureFlag(actor.id, {
    key,
    enabled: enabledValue === "true",
    expectedVersion,
    reason,
    ...(commandId ? { commandId } : {})
  });
  if (!result.ok) throw new Error(result.error);

  console.log(JSON.stringify({
    ok: true,
    key: result.flag?.key,
    enabled: result.flag?.enabled,
    version: result.flag?.version,
    commandId: result.commandId,
    auditLogId: result.auditLogId,
    replayed: result.replayed
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
