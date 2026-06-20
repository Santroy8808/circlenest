import { execSync } from "node:child_process";
import path from "node:path";

const expectedPath = "C:\\Repos\\Theta-Space-net\\NewRepo";
const expectedRemote = "https://github.com/Santroy8808/circlenest.git";

function fail(message: string): never {
  console.error(`[workspace:verify] ${message}`);
  process.exit(1);
}

const cwd = path.resolve(process.cwd());

if (cwd.toLowerCase() !== expectedPath.toLowerCase()) {
  fail(`Wrong working directory: ${cwd}. Expected ${expectedPath}.`);
}

let remote = "";
let branch = "";

try {
  remote = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
  branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
} catch (error) {
  fail("Could not read git remote/branch.");
}

if (remote !== expectedRemote) {
  fail(`Wrong origin remote: ${remote}. Expected ${expectedRemote}.`);
}

if (branch !== "main") {
  fail(`Unexpected branch: ${branch}. Expected main for production-source work.`);
}

console.log("[workspace:verify] OK");
console.log(`[workspace:verify] path: ${cwd}`);
console.log(`[workspace:verify] origin: ${remote}`);
console.log(`[workspace:verify] branch: ${branch}`);
