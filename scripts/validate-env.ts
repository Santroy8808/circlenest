import "./load-next-env";
import { safeReadPlatformEnv } from "../src/lib/platform/env";

const result = safeReadPlatformEnv();

if (!result.success) {
  console.error("Environment validation failed:");
  for (const issue of result.error.issues) {
    console.error(`- ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

console.info("Environment validation passed.");
