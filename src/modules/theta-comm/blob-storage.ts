import { createHash, randomBytes } from "crypto";
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "fs/promises";
import path from "path";

function storageRoot() {
  const configured = process.env.THETA_COMM_STORAGE_ROOT?.trim();
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("THETA_COMM_STORAGE_ROOT must point to durable server-local storage.");
  }
  return path.resolve(configured || path.join(process.cwd(), ".theta-comm-storage"));
}

function resolveWithin(root: string, segments: readonly string[]) {
  const resolved = path.resolve(root, ...segments);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid Theta-Comm storage path.");
  }
  return resolved;
}

function validateOpaqueSegment(value: string) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(value)) {
    throw new Error("Invalid Theta-Comm storage identifier.");
  }
  return value;
}

function objectPath(storageKey: string) {
  const segments = storageKey.split("/").filter(Boolean);
  if (
    segments.length < 2 ||
    segments.some((segment) => !/^[A-Za-z0-9._-]{1,160}$/.test(segment))
  ) {
    throw new Error("Invalid Theta-Comm storage key.");
  }
  return resolveWithin(path.join(storageRoot(), "objects"), segments);
}

function pendingDirectory(uploadId: string) {
  return resolveWithin(path.join(storageRoot(), "pending"), [
    validateOpaqueSegment(uploadId)
  ]);
}

function pendingPartPath(uploadId: string, partNumber: number) {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
    throw new Error("Invalid Theta-Comm upload part.");
  }
  return resolveWithin(pendingDirectory(uploadId), [`${partNumber}.part`]);
}

async function atomicWrite(destination: string, bytes: Buffer) {
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${randomBytes(12).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600 });
    await rm(destination, { force: true });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function writePendingThetaCommPart(
  uploadId: string,
  partNumber: number,
  bytes: Buffer
) {
  await atomicWrite(pendingPartPath(uploadId, partNumber), bytes);
  return createHash("sha256").update(bytes).digest("hex");
}

export async function writePendingThetaCommThumbnail(
  uploadId: string,
  bytes: Buffer
) {
  const destination = resolveWithin(pendingDirectory(uploadId), ["thumbnail.part"]);
  await atomicWrite(destination, bytes);
  return createHash("sha256").update(bytes).digest("hex");
}

export async function pendingThetaCommPartSize(
  uploadId: string,
  partNumber: number
) {
  return (await stat(pendingPartPath(uploadId, partNumber))).size;
}

export async function finalizeThetaCommUpload(input: {
  uploadId: string;
  storageKey: string;
  thumbnailStorageKey?: string | null;
  totalChunks: number;
  expectedSizeBytes: bigint;
  ciphertextSha256: string;
  thumbnailExpectedSizeBytes?: bigint | null;
  thumbnailCiphertextSha256?: string | null;
}) {
  const destination = objectPath(input.storageKey);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${randomBytes(12).toString("hex")}.tmp`;
  const hash = createHash("sha256");
  let size = BigInt(0);
  try {
    await writeFile(temporary, Buffer.alloc(0), { mode: 0o600 });
    for (let partNumber = 1; partNumber <= input.totalChunks; partNumber += 1) {
      const bytes = await readFile(pendingPartPath(input.uploadId, partNumber));
      hash.update(bytes);
      size += BigInt(bytes.length);
      await appendFile(temporary, bytes);
    }
    if (
      size !== input.expectedSizeBytes ||
      hash.digest("hex") !== input.ciphertextSha256.toLowerCase()
    ) {
      throw new Error("Encrypted attachment failed server checksum verification.");
    }
    await rm(destination, { force: true });
    await rename(temporary, destination);

    if (
      input.thumbnailStorageKey &&
      input.thumbnailExpectedSizeBytes &&
      input.thumbnailCiphertextSha256
    ) {
      const pendingThumbnail = resolveWithin(pendingDirectory(input.uploadId), [
        "thumbnail.part"
      ]);
      const thumbnailBytes = await readFile(pendingThumbnail);
      const thumbnailHash = createHash("sha256").update(thumbnailBytes).digest("hex");
      if (
        BigInt(thumbnailBytes.length) !== input.thumbnailExpectedSizeBytes ||
        thumbnailHash !== input.thumbnailCiphertextSha256.toLowerCase()
      ) {
        throw new Error("Encrypted thumbnail failed server checksum verification.");
      }
      await atomicWrite(objectPath(input.thumbnailStorageKey), thumbnailBytes);
    }
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function removePendingThetaCommUpload(uploadId: string) {
  await rm(pendingDirectory(uploadId), { recursive: true, force: true });
}

export async function thetaCommStoredObject(storageKey: string) {
  const filePath = objectPath(storageKey);
  const metadata = await stat(filePath);
  if (!metadata.isFile()) throw new Error("Theta-Comm encrypted object is unavailable.");
  return { filePath, size: metadata.size };
}
