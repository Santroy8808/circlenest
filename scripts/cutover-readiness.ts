import "./load-next-env";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { safeReadPlatformEnv } from "../src/lib/platform/env";

type CheckStatus = "pass" | "warn" | "fail";

type Check = {
  status: CheckStatus;
  label: string;
  detail: string;
};

const repoRoot = process.cwd();
const productionRepoPath = process.env.THETA_PROD_REPO ?? "C:\\Repos\\thetansplace\\circlenest";
const requiredProductionEnv = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "CLOUDFLARE_R2_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_BUCKET",
  "CLOUDFLARE_R2_PUBLIC_BASE_URL"
];

function git(args: string[]) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function check(status: CheckStatus, label: string, detail: string): Check {
  return { status, label, detail };
}

function exists(relativePath: string) {
  return existsSync(path.join(repoRoot, relativePath));
}

function readPackageName() {
  try {
    const raw = readFileSync(path.join(repoRoot, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { name?: string };
    return parsed.name;
  } catch {
    return undefined;
  }
}

function getGitChecks(): Check[] {
  try {
    const branch = git(["branch", "--show-current"]) || "(detached)";
    const status = git(["status", "--porcelain"]);
    const remotes = git(["remote", "-v"]);

    return [
      check(branch === "main" ? "pass" : "warn", "Git branch", `Current branch is ${branch}.`),
      check(status.length === 0 ? "pass" : "warn", "Git worktree", status.length === 0 ? "Worktree is clean." : "Worktree has uncommitted changes."),
      check(
        remotes.includes("Santroy8808") || remotes.includes("circlenest") ? "pass" : "warn",
        "Git remote",
        remotes || "No remotes configured."
      )
    ];
  } catch (error) {
    return [
      check(
        "fail",
        "Git checks",
        error instanceof Error ? error.message : "Could not inspect Git state."
      )
    ];
  }
}

function getEnvChecks(): Check[] {
  const parsed = safeReadPlatformEnv();
  const missingProductionEnv = requiredProductionEnv.filter((key) => !process.env[key]);

  return [
    check(parsed.success ? "pass" : "fail", "Base environment schema", parsed.success ? "Required platform environment shape is valid." : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")),
    check(
      missingProductionEnv.length === 0 ? "pass" : "warn",
      "Production environment variables",
      missingProductionEnv.length === 0
        ? "Production-like Neon/Auth/R2 variables are present."
        : `Missing or empty for production cutover: ${missingProductionEnv.join(", ")}.`
    )
  ];
}

const checks: Check[] = [
  check(exists("package.json") ? "pass" : "fail", "Repo package", exists("package.json") ? "package.json found." : "package.json missing."),
  check(exists("prisma/schema.prisma") ? "pass" : "fail", "Prisma schema", exists("prisma/schema.prisma") ? "Prisma schema found." : "Prisma schema missing."),
  check(readPackageName() === "theta-space-newrepo" ? "pass" : "warn", "Repo identity", `package name is ${readPackageName() ?? "unknown"}.`),
  check(existsSync(productionRepoPath) ? "pass" : "warn", "Production repo path", existsSync(productionRepoPath) ? `${productionRepoPath} exists.` : `${productionRepoPath} was not found.`),
  ...getGitChecks(),
  ...getEnvChecks()
];

console.info("Theta-Space cutover readiness preflight");
console.info(`NewRepo: ${repoRoot}`);
console.info(`Production repo: ${productionRepoPath}`);
console.info("");

for (const item of checks) {
  console.info(`[${item.status.toUpperCase()}] ${item.label}: ${item.detail}`);
}

const failures = checks.filter((item) => item.status === "fail");
const warnings = checks.filter((item) => item.status === "warn");

console.info("");
console.info(`Summary: ${failures.length} failed, ${warnings.length} warnings, ${checks.length - failures.length - warnings.length} passed.`);

if (failures.length > 0) {
  process.exit(1);
}
