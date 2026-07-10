import "./load-next-env";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { safeReadPlatformEnv, safeReadProductionEnv } from "../src/lib/platform/env";

type CheckStatus = "pass" | "warn" | "fail" | "manual";

type Check = {
  status: CheckStatus;
  label: string;
  detail: string;
};

const repoRoot = process.cwd();
const expectedLocalRepoPath = "C:\\Repos\\Theta-Space-net\\NewRepo";
const expectedProductionRepoPath = "S:\\Workspace\\circlenest";
const productionRepoPath = process.env.THETA_PROD_REPO ?? expectedProductionRepoPath;
const productionSshHost = "207.188.9.139";
const productionWindowsIdentity = "ts\\codexadmin";
const productionPublicOrigin = "https://theta-space.net";

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

function sameWindowsPath(left: string, right: string) {
  return path.win32.normalize(left).toLowerCase() === path.win32.normalize(right).toLowerCase();
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
  const production = safeReadProductionEnv();

  return [
    check(parsed.success ? "pass" : "fail", "Base environment schema", parsed.success ? "Required platform environment shape is valid." : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")),
    check(
      production.success ? "pass" : "fail",
      "Local candidate production environment",
      production.success
        ? "The locally loaded candidate satisfies the database, independent auth/mobile/IP-hash secrets, matching HTTPS origins, recovery SMTP, safe auth/upload toggles, and distinct public/private R2 bucket contract. This does not verify the remote production environment."
        : `The locally loaded candidate is not production-safe: ${production.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`
    )
  ];
}

const checks: Check[] = [
  check(exists("package.json") ? "pass" : "fail", "Repo package", exists("package.json") ? "package.json found." : "package.json missing."),
  check(exists("prisma/schema.prisma") ? "pass" : "fail", "Prisma schema", exists("prisma/schema.prisma") ? "Prisma schema found." : "Prisma schema missing."),
  check(readPackageName() === "theta-space-newrepo" ? "pass" : "warn", "Repo identity", `package name is ${readPackageName() ?? "unknown"}.`),
  check(
    sameWindowsPath(repoRoot, expectedLocalRepoPath) ? "pass" : "warn",
    "Local checkout",
    sameWindowsPath(repoRoot, expectedLocalRepoPath)
      ? `Running from the documented local checkout ${expectedLocalRepoPath}.`
      : `Running from ${repoRoot}; the documented local checkout is ${expectedLocalRepoPath}. A deliberate review worktree is acceptable.`
  ),
  check(
    sameWindowsPath(productionRepoPath, expectedProductionRepoPath) ? "manual" : "fail",
    "Remote production verification",
    sameWindowsPath(productionRepoPath, expectedProductionRepoPath)
      ? `MANUAL GATE: verify host ${productionSshHost}, Windows identity ${productionWindowsIdentity}, checkout ${productionRepoPath}, public origin ${productionPublicOrigin}, deployed commit, service health, and the fail-closed environment on the server. This preflight does not connect to production.`
      : `THETA_PROD_REPO points to ${productionRepoPath}; documented remote checkout is ${expectedProductionRepoPath}.`
  ),
  ...getGitChecks(),
  ...getEnvChecks()
];

console.info("Theta-Space local cutover candidate preflight");
console.info(`Local repo: ${repoRoot}`);
console.info(`Production target (remote, unverified): ${productionRepoPath}`);
console.info("");

for (const item of checks) {
  console.info(`[${item.status.toUpperCase()}] ${item.label}: ${item.detail}`);
}

const failures = checks.filter((item) => item.status === "fail");
const warnings = checks.filter((item) => item.status === "warn");
const manualGates = checks.filter((item) => item.status === "manual");
const passes = checks.filter((item) => item.status === "pass");

console.info("");
console.info(
  `Summary: ${failures.length} failed, ${manualGates.length} ${manualGates.length === 1 ? "manual gate" : "manual gates"}, ${warnings.length} warnings, ${passes.length} passed.`
);

if (failures.length > 0 || manualGates.length > 0) {
  process.exit(1);
}
