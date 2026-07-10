const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCAL_QA_SCHEMA = "codex_qa";

export const LOCAL_QA_DEMO_DOMAIN = "demo.theta-space.dev";
export const LOCAL_QA_PASSWORD = "ThetaLocal!2026";
export const LOCAL_QA_ADMIN_EMAIL = `admin@${LOCAL_QA_DEMO_DOMAIN}`;

export function assertLocalQaDatabase() {
  if (!process.argv.includes("--confirm-local")) {
    throw new Error("Local QA seeding requires the explicit --confirm-local flag.");
  }

  if (process.env.NODE_ENV?.toLowerCase() === "production") {
    throw new Error("Local QA seeding is disabled when NODE_ENV=production.");
  }

  const rawDatabaseUrl = process.env.DATABASE_URL?.trim();
  if (!rawDatabaseUrl) {
    throw new Error("DATABASE_URL is required for local QA seeding.");
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(rawDatabaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }

  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error("Local QA seeding requires PostgreSQL.");
  }

  // WHATWG URL keeps brackets around IPv6 literals (for example `[::1]`).
  // Normalize them before checking the loopback allow-list.
  const hostname = databaseUrl.hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (!LOCAL_DATABASE_HOSTS.has(hostname)) {
    throw new Error(`Local QA seeding refused non-local database host: ${hostname || "(missing)"}.`);
  }

  const schema = databaseUrl.searchParams.get("schema");
  if (schema !== LOCAL_QA_SCHEMA) {
    throw new Error(`Local QA seeding requires the isolated ${LOCAL_QA_SCHEMA} schema.`);
  }

  const database = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
  if (!database) {
    throw new Error("DATABASE_URL must name a database.");
  }

  const port = databaseUrl.port || "5432";
  console.log(`Local QA safety check passed: ${hostname}:${port}/${database} (schema ${schema}).`);
}
