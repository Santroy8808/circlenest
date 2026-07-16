import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const newRepoRoot = process.cwd();
const productionRepoPath = process.env.THETA_PROD_REPO ?? "C:\\Repos\\thetansplace\\circlenest";
const outputPath = path.join(newRepoRoot, "docs", "promotion-dry-run.md");

function run(command: string, args: string[], cwd: string) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function safeRun(command: string, args: string[], cwd: string, fallback = "") {
  try {
    return run(command, args, cwd);
  } catch {
    return fallback;
  }
}

function toLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function normalizeFilePath(filePath: string) {
  return filePath.replace(/\\/g, "/");
}

function bulletList(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- none";
}

function sampleList(items: string[], limit = 30) {
  const visible = items.slice(0, limit);
  const suffix = items.length > limit ? [`- ... ${items.length - limit} more`] : [];
  return [...visible.map((item) => `- \`${item}\``), ...suffix].join("\n") || "- none";
}

function isExcluded(filePath: string) {
  const normalized = normalizeFilePath(filePath);
  const fileName = path.posix.basename(normalized);

  return (
    normalized.startsWith(".git/") ||
    normalized.startsWith(".next/") ||
    normalized.startsWith("node_modules/") ||
    normalized.startsWith("coverage/") ||
    normalized.startsWith("dist/") ||
    normalized.startsWith("tmp/") ||
    normalized.startsWith("uploads/") ||
    normalized.startsWith(".turbo/") ||
    normalized.startsWith(".vercel/") ||
    normalized.startsWith(".netlify/") ||
    normalized.startsWith("prisma/migrations/migration_lock.toml") ||
    normalized === ".env" ||
    (normalized.startsWith(".env.") && normalized !== ".env.example") ||
    normalized.endsWith(".db") ||
    normalized.endsWith(".sqlite") ||
    normalized.endsWith(".sqlite3") ||
    normalized.endsWith(".tsbuildinfo") ||
    fileName === "DumpStack.log.tmp" ||
    fileName === "hiberfil.sys" ||
    fileName === "pagefile.sys" ||
    fileName === "swapfile.sys"
  );
}

function categoryFor(filePath: string) {
  const normalized = normalizeFilePath(filePath);
  if (normalized.startsWith("src/app/")) return "App routes";
  if (normalized.startsWith("src/components/")) return "Components";
  if (normalized.startsWith("src/modules/")) return "Modules";
  if (normalized.startsWith("src/lib/")) return "Platform libraries";
  if (normalized.startsWith("prisma/")) return "Prisma";
  if (normalized.startsWith("scripts/")) return "Scripts";
  if (normalized.startsWith("docs/")) return "Docs";
  if (normalized.startsWith("public/")) return "Public assets";
  if (normalized.includes("test") || normalized.includes("spec")) return "Tests";
  return "Root/config";
}

function countByCategory(files: string[]) {
  const counts = new Map<string, number>();
  for (const file of files) {
    const category = categoryFor(file);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, count]) => `- ${category}: ${count}`);
}

const newRepoFiles = toLines(safeRun("git", ["ls-files"], newRepoRoot));
const prodFiles = toLines(safeRun("git", ["ls-files"], productionRepoPath));
const newRepoStatus = safeRun("git", ["status", "--porcelain"], newRepoRoot);
const prodStatus = safeRun("git", ["status", "--porcelain"], productionRepoPath);
const newRepoCommit = safeRun("git", ["rev-parse", "--short", "HEAD"], newRepoRoot, "unknown");
const newRepoFullCommit = safeRun("git", ["rev-parse", "HEAD"], newRepoRoot, "unknown");
const prodCommit = safeRun("git", ["rev-parse", "--short", "HEAD"], productionRepoPath, "unknown");
const prodFullCommit = safeRun("git", ["rev-parse", "HEAD"], productionRepoPath, "unknown");
const prodBranch = safeRun("git", ["branch", "--show-current"], productionRepoPath, "unknown");

const includedFiles = newRepoFiles.map(normalizeFilePath).filter((file) => !isExcluded(file)).sort();
const excludedTrackedFiles = newRepoFiles.map(normalizeFilePath).filter(isExcluded).sort();
const prodTrackedFiles = prodFiles.map(normalizeFilePath).sort();
const prodOnlyFiles = prodTrackedFiles.filter((file) => !includedFiles.includes(file)).sort();
const newOnlyFiles = includedFiles.filter((file) => !prodTrackedFiles.includes(file)).sort();
const sharedFiles = includedFiles.filter((file) => prodTrackedFiles.includes(file)).sort();
const prodLocalArtifacts = toLines(prodStatus).filter((line) => {
  const filePath = line.slice(3).trim();
  return isExcluded(filePath) || line.startsWith("??");
});

const warnings = [
  newRepoStatus ? "NewRepo has uncommitted changes while generating this dry run." : null,
  prodStatus ? "Production repo has uncommitted changes or untracked files." : null,
  prodBranch !== "main" ? `Production repo is on ${prodBranch}, not main.` : null,
  prodLocalArtifacts.length ? "Production repo contains local artifacts that should not be promoted." : null
].filter((warning): warning is string => Boolean(warning));

const content = `# Theta-Space Promotion Dry Run

Generated: ${new Date().toISOString()}

## Purpose

Read-only manifest of what NewRepo would contribute to a future production promotion.

This document does not copy files, delete files, archive production, push GitHub, migrate production PostgreSQL, deploy the Windows service, or touch Cloudflare R2.

## Source State

- NewRepo path: \`${newRepoRoot}\`
- NewRepo commit: \`${newRepoCommit}\`
- NewRepo full commit: \`${newRepoFullCommit}\`
- NewRepo worktree: ${newRepoStatus ? "dirty when dry run was generated" : "clean when dry run was generated"}
- Production repo path: \`${productionRepoPath}\`
- Production branch: \`${prodBranch}\`
- Production commit: \`${prodCommit}\`
- Production full commit: \`${prodFullCommit}\`
- Production worktree: ${prodStatus ? "dirty" : "clean"}

## Summary

- NewRepo tracked files: ${newRepoFiles.length}
- Included tracked files: ${includedFiles.length}
- Excluded tracked files: ${excludedTrackedFiles.length}
- Shared production paths: ${sharedFiles.length}
- New paths not currently in production: ${newOnlyFiles.length}
- Production tracked paths not in NewRepo: ${prodOnlyFiles.length}

## Included File Categories

${countByCategory(includedFiles).join("\n")}

## Exclusion Rules

Never copy these during promotion:

- Git internals: \`.git\`
- Build output: \`.next\`, \`dist\`, \`coverage\`, \`.turbo\`
- Dependencies: \`node_modules\`
- Hosting leftovers: \`.vercel\`, \`.netlify\`
- Local env and secrets: \`.env\` and \`.env.*\` except tracked templates such as \`.env.example\`
- Local databases: \`*.db\`, \`*.sqlite\`, \`*.sqlite3\`
- TypeScript build cache: \`*.tsbuildinfo\`
- Local upload/output folders: \`uploads\`, \`tmp\`
- Windows system files: \`DumpStack.log.tmp\`, \`hiberfil.sys\`, \`pagefile.sys\`, \`swapfile.sys\`

## Excluded Tracked Files

${sampleList(excludedTrackedFiles)}

## NewRepo Files Not Currently In Production

${sampleList(newOnlyFiles)}

## Production Tracked Files Not In NewRepo

These production paths need a conscious keep/remove decision before overwrite:

${sampleList(prodOnlyFiles)}

## Production Local Artifacts

These are uncommitted production worktree entries or ignored-looking files:

${bulletList(prodLocalArtifacts.map((line) => `\`${line}\``))}

## Warnings

${bulletList(warnings)}

## Promotion Boundary

- Use this dry run to review file scope before archive and promotion.
- A future copy command should be driven by tracked source files plus explicit exclusions.
- Do not promote if production has unexplained local artifacts.
- Do not promote if NewRepo is dirty.
- Do not treat this dry run as approval to deploy.
`;

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, content, "utf8");

console.info(`Promotion dry run written to ${outputPath}`);
if (warnings.length) {
  console.info(`Warnings: ${warnings.length}`);
  for (const warning of warnings) console.info(`- ${warning}`);
}
