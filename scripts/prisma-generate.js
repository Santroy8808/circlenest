const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function readDatabaseUrlFromEnvFile() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) continue;

    const contents = fs.readFileSync(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^DATABASE_URL\s*=\s*(.*)$/);
      if (!match) continue;
      return match[1].trim().replace(/^['"]|['"]$/g, "");
    }
  }

  return "";
}

function resolveSchemaFromEnv() {
  const databaseUrl = (process.env.DATABASE_URL || readDatabaseUrlFromEnvFile()).trim().toLowerCase();
  if (databaseUrl.startsWith("file:")) {
    return path.join("prisma", "schema.prisma");
  }
  const runningOnRailway = Boolean(
    process.env.RAILWAY_ENVIRONMENT_ID ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID,
  );
  if (runningOnRailway || process.env.NODE_ENV === "production") {
    return path.join("prisma", "schema.postgres.prisma");
  }
  if (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")) {
    return path.join("prisma", "schema.postgres.prisma");
  }
  return path.join("prisma", "schema.postgres.prisma");
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
