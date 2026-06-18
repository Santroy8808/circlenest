import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getModuleDefinitions, milestoneDefinitions } from "../src/modules/platform-infrastructure/platform.service";

const repoRoot = process.cwd();
const outputPath = path.join(repoRoot, "docs", "release-candidate.md");

function git(args: string[]) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function safeGit(args: string[], fallback: string) {
  try {
    return git(args);
  } catch {
    return fallback;
  }
}

function sectionList(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

const commit = safeGit(["rev-parse", "--short", "HEAD"], "unknown");
const fullCommit = safeGit(["rev-parse", "HEAD"], "unknown");
const branch = safeGit(["branch", "--show-current"], "unknown");
const status = safeGit(["status", "--porcelain"], "");
const recentCommits = safeGit(["log", "--oneline", "-8"], "")
  .split(/\r?\n/)
  .filter(Boolean);
const modules = getModuleDefinitions();
const readyModules = modules.filter((module) => module.status === "ready");
const nextMilestone = [...milestoneDefinitions].reverse().find((milestone) => milestone.status === "Next");

const content = `# Theta-Space NewRepo Release Candidate

Generated: ${new Date().toISOString()}

## Source

- Repo: \`${repoRoot}\`
- Branch: \`${branch}\`
- Commit: \`${commit}\`
- Full commit: \`${fullCommit}\`
- Worktree: ${status ? "dirty when manifest was generated" : "clean when manifest was generated"}

## Current Readiness

- Ready modules: ${readyModules.length} of ${modules.length}
- Next milestone: ${nextMilestone ? `${nextMilestone.label} - ${nextMilestone.title}` : "none"}

## Ready Modules

${sectionList(readyModules.map((module) => `\`${module.key}\` - ${module.title}`))}

## Required Validation Commands

\`\`\`powershell
npm run lint
npm run typecheck
npm run build
npm run cutover:check
npm run promote:dry-run
npm run services:readiness
\`\`\`

## Browser QC Routes

${sectionList([
  "`/login` - login form and credentials flow",
  "`/home` - authenticated stream",
  "`/search` - protected privacy-aware search",
  "`/profile/gallery` - My Pics without secure-area prompt",
  "`/groups` - group directory and profile navigation",
  "`/mail` - mail-only client",
  "`/market` - square listing cards",
  "`/jobs` - clickable job cards and details",
  "`/feedback/new` - support ticket creation",
  "`/admin` - protected admin card/wizard interface"
])}

## Recent Commits

${sectionList(recentCommits.map((line) => `\`${line}\``))}

## Production Boundary

- This manifest does not push to GitHub.
- This manifest does not migrate Neon.
- This manifest does not touch Railway.
- This manifest does not touch Cloudflare R2.
- Production promotion still requires an explicit approval, an archive tag, and live smoke verification.

## Rollback Reminder

Before production overwrite, tag the current production commit as \`archive-YYYY-MM-DD.vN\`. If smoke fails, rollback should target that explicit archive tag only after approval.
`;

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, content, "utf8");

console.info(`Release candidate manifest written to ${outputPath}`);
