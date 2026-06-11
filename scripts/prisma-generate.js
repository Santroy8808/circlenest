const { spawnSync } = require("node:child_process");
const path = require("node:path");

function resolveSchemaFromEnv() {
  const databaseUrl = (process.env.DATABASE_URL || "").trim().toLowerCase();
  if (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")) {
    return path.join("prisma", "schema.postgres.prisma");
  }
  return path.join("prisma", "schema.prisma");
}

const schemaPath = process.env.PRISMA_GENERATE_SCHEMA?.trim() || resolveSchemaFromEnv();
const prismaCli = require.resolve("prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCli, "generate", "--schema", schemaPath], {
  stdio: "inherit",
  shell: false,
  env: process.env,
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
