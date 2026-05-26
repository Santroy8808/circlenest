import crypto from "node:crypto";

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function randomToken(size = 32): string {
  return crypto.randomBytes(size).toString("hex");
}
