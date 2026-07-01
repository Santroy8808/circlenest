import packageJson from "../../../package.json";

export type PlatformReleaseInfo = {
  appName: string;
  version: string;
  buildId: string | null;
  commitSha: string | null;
  deploymentId: string | null;
  environmentName: string | null;
  nodeEnv: string;
};

function readFirst(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim().length > 0)?.trim() ?? null;
}

export function getPlatformReleaseInfo(): PlatformReleaseInfo {
  return {
    appName: packageJson.name,
    version: readFirst(process.env.APP_VERSION, packageJson.version) ?? "0.0.0",
    buildId: readFirst(process.env.NEXT_PUBLIC_BUILD_ID, process.env.RAILWAY_DEPLOYMENT_ID),
    commitSha: readFirst(process.env.RAILWAY_GIT_COMMIT_SHA, process.env.VERCEL_GIT_COMMIT_SHA, process.env.GIT_COMMIT_SHA),
    deploymentId: readFirst(process.env.RAILWAY_DEPLOYMENT_ID, process.env.VERCEL_DEPLOYMENT_ID),
    environmentName: readFirst(process.env.RAILWAY_ENVIRONMENT_NAME, process.env.NODE_ENV),
    nodeEnv: process.env.NODE_ENV ?? "development"
  };
}
