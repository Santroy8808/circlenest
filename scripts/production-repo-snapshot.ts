import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const newRepoRoot = process.cwd();
const productionRepoPath = process.env.THETA_PROD_REPO ?? "C:\\Repos\\thetansplace\\circlenest";
const outputPath = path.join(newRepoRoot, "docs", "production-repo-snapshot.md");

function run(command: string, args: string[], cwd: string) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function safeRun(command: string, args: string[], cwd: string, fallback = "unavailable") {
  try {
    return run(command, args, cwd);
  } catch {
    return fallback;
  }
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function bulletList(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- none";
}

type PackageJson = {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
};

const newRepoPackage = readJsonFile<PackageJson>(path.join(newRepoRoot, "package.json"));
const prodPackage = existsSync(productionRepoPath)
  ? readJsonFile<PackageJson>(path.join(productionRepoPath, "package.json"))
  : null;
const prodExists = existsSync(productionRepoPath);
const prodGitExists = existsSync(path.join(productionRepoPath, ".git"));
const prodBranch = prodExists ? safeRun("git", ["branch", "--show-current"], productionRepoPath) : "missing";
const prodCommit = prodExists ? safeRun("git", ["rev-parse", "--short", "HEAD"], productionRepoPath) : "missing";
const prodFullCommit = prodExists ? safeRun("git", ["rev-parse", "HEAD"], productionRepoPath) : "missing";
const prodStatus = prodExists ? safeRun("git", ["status", "--porcelain"], productionRepoPath, "") : "missing";
const prodRemote = prodExists ? safeRun("git", ["remote", "-v"], productionRepoPath, "No remotes configured.") : "missing";
const prodRecentCommits = prodExists
  ? safeRun("git", ["log", "--oneline", "-8"], productionRepoPath, "")
      .split(/\r?\n/)
      .filter(Boolean)
  : [];
const prodArchiveTags = prodExists
  ? safeRun("git", ["tag", "--list", "archive-*"], productionRepoPath, "")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-12)
  : [];
const newRepoCommit = safeRun("git", ["rev-parse", "--short", "HEAD"], newRepoRoot);
const newRepoFullCommit = safeRun("git", ["rev-parse", "HEAD"], newRepoRoot);
const newRepoStatus = safeRun("git", ["status", "--porcelain"], newRepoRoot, "");

const warnings = [
  !prodExists ? `Production repo path does not exist: ${productionRepoPath}` : null,
  prodExists && !prodGitExists ? "Production path exists but is not a Git repo." : null,
  prodBranch !== "main" ? `Production branch is ${prodBranch}, not main.` : null,
  prodStatus ? "Production repo has uncommitted changes." : null,
  !prodRemote.includes("Santroy8808") && !prodRemote.includes("circlenest")
    ? "Production remote does not obviously point at Santroy8808/circlenest."
    : null,
  !prodArchiveTags.length ? "No archive-* rollback tags found in production repo." : null,
  newRepoStatus ? "NewRepo has uncommitted changes while generating this snapshot." : null
].filter((warning): warning is string => Boolean(warning));

const content = `# Theta-Space Production Repo Snapshot

Generated: ${new Date().toISOString()}

## Purpose

Read-only snapshot of the local production repo path before any future NewRepo cutover.

This document does not copy files, push to GitHub, migrate production PostgreSQL, deploy the Windows service, or touch Cloudflare R2.

## Paths

- NewRepo: \`${newRepoRoot}\`
- Production repo: \`${productionRepoPath}\`

## NewRepo Source

- Package: \`${newRepoPackage?.name ?? "unknown"}\`
- Commit: \`${newRepoCommit}\`
- Full commit: \`${newRepoFullCommit}\`
- Worktree: ${newRepoStatus ? "dirty when snapshot was generated" : "clean when snapshot was generated"}

## Production Repo Source

- Exists: ${prodExists ? "yes" : "no"}
- Git repo: ${prodGitExists ? "yes" : "no"}
- Package: \`${prodPackage?.name ?? "unknown"}\`
- Version: \`${prodPackage?.version ?? "unknown"}\`
- Branch: \`${prodBranch}\`
- Commit: \`${prodCommit}\`
- Full commit: \`${prodFullCommit}\`
- Worktree: ${prodStatus ? "dirty" : "clean"}

## Production Remote

\`\`\`text
${prodRemote || "No remotes configured."}
\`\`\`

## Production Recent Commits

${bulletList(prodRecentCommits.map((line) => `\`${line}\``))}

## Archive Tags

${bulletList(prodArchiveTags.map((tag) => `\`${tag}\``))}

## Script Comparison

- NewRepo scripts: ${Object.keys(newRepoPackage?.scripts ?? {}).sort().join(", ") || "none"}
- Production scripts: ${Object.keys(prodPackage?.scripts ?? {}).sort().join(", ") || "none"}

## Warnings

${bulletList(warnings)}

## Cutover Boundary

- If warnings exist, resolve them before production promotion.
- Archive production with \`archive-YYYY-MM-DD.vN\` before overwrite.
- Use \`--force-with-lease\` only for an approved rollback to a verified archive tag.
- Do not treat this snapshot as approval to push production.
`;

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, content, "utf8");

console.info(`Production repo snapshot written to ${outputPath}`);
if (warnings.length) {
  console.info(`Warnings: ${warnings.length}`);
  for (const warning of warnings) {
    console.info(`- ${warning}`);
  }
}
