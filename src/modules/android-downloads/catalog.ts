import path from "node:path";

export type AndroidDownloadId = "theta-space" | "theta-comm";

export type AndroidDownload = {
  id: AndroidDownloadId;
  name: string;
  version: string;
  downloadName: string;
  sourcePath: string;
};

const downloads: Record<AndroidDownloadId, Omit<AndroidDownload, "sourcePath"> & { relativePath: string; sourceEnvironmentKey: string }> = {
  "theta-space": {
    id: "theta-space",
    name: "Theta-Space for Android",
    version: "24.0.45",
    downloadName: "Theta-Space-Android-v24.0.45.apk",
    relativePath: path.join("theta-space", "Theta-Space-App-latest-debug.apk"),
    sourceEnvironmentKey: "ANDROID_THETA_SPACE_APK"
  },
  "theta-comm": {
    id: "theta-comm",
    name: "Theta-Comm for Android",
    version: "2.0.0-beta01",
    downloadName: "Theta-Comm-Android-v2.0.0-beta01.apk",
    relativePath: path.join("theta-comm", "2.0.0-beta01", "theta-comm-2.0.0-beta01-arm64-internal.apk"),
    sourceEnvironmentKey: "ANDROID_THETA_COMM_APK"
  }
};

export function isAndroidDownloadId(value: string): value is AndroidDownloadId {
  return value === "theta-space" || value === "theta-comm";
}

export function getAndroidDownload(id: AndroidDownloadId): AndroidDownload {
  const download = downloads[id];
  const configuredPath = process.env[download.sourceEnvironmentKey]?.trim();
  const root = process.env.ANDROID_APK_ROOT?.trim() || path.join(process.cwd(), "android-apk");

  return {
    id: download.id,
    name: download.name,
    version: download.version,
    downloadName: download.downloadName,
    sourcePath: configuredPath ? path.resolve(configuredPath) : path.resolve(root, download.relativePath)
  };
}

export function listAndroidDownloads() {
  return (["theta-space", "theta-comm"] as const).map(getAndroidDownload);
}
