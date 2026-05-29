import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const uploadDir = path.join(process.cwd(), "public", "uploads");

export async function saveUploadToLocal(file: File): Promise<string> {
  await fs.mkdir(uploadDir, { recursive: true });
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const name = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const full = path.join(uploadDir, name);
  await fs.writeFile(full, bytes);
  return `/uploads/${name}`;
}

export async function deleteUploadFromLocal(url: string): Promise<void> {
  if (!url.startsWith("/uploads/")) return;
  const fileName = path.basename(url);
  const full = path.join(uploadDir, fileName);
  try {
    await fs.unlink(full);
  } catch {
    // Ignore missing files and best-effort deletes.
  }
}
