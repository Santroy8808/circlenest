import { createReadStream } from "fs";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { diagnostics } from "@/lib/platform/logging";
import { ThetaCommError } from "@/modules/theta-comm/theta-comm.shared";

export async function readThetaCommBinaryRequest(
  request: Request,
  maximumBytes: number
) {
  const contentLength = Number.parseInt(
    request.headers.get("content-length") ?? "",
    10
  );
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new ThetaCommError(
      413,
      "UPLOAD_TOO_LARGE",
      "Encrypted upload part is too large."
    );
  }
  if (!request.body) {
    throw new ThetaCommError(
      400,
      "EMPTY_UPLOAD",
      "Encrypted upload part is empty."
    );
  }
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new ThetaCommError(
        413,
        "UPLOAD_TOO_LARGE",
        "Encrypted upload part is too large."
      );
    }
    chunks.push(Buffer.from(value));
  }
  if (size === 0) {
    throw new ThetaCommError(
      400,
      "EMPTY_UPLOAD",
      "Encrypted upload part is empty."
    );
  }
  return Buffer.concat(chunks, size);
}

export function thetaCommEncryptedFileResponse(
  request: NextRequest,
  file: { filePath: string; size: number }
) {
  let start = 0;
  let end = file.size - 1;
  let status = 200;
  const requestedRange = request.headers.get("range");
  if (requestedRange) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(requestedRange.trim());
    if (!match || (!match[1] && !match[2])) {
      return new Response(null, {
        status: 416,
        headers: { "content-range": `bytes */${file.size}` }
      });
    }
    if (!match[1]) {
      const suffixLength = Number.parseInt(match[2], 10);
      if (!Number.isFinite(suffixLength) || suffixLength < 1) {
        return new Response(null, {
          status: 416,
          headers: { "content-range": `bytes */${file.size}` }
        });
      }
      start = Math.max(0, file.size - suffixLength);
    } else {
      start = Number.parseInt(match[1], 10);
      end = match[2] ? Number.parseInt(match[2], 10) : end;
    }
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      start >= file.size ||
      end < start
    ) {
      return new Response(null, {
        status: 416,
        headers: { "content-range": `bytes */${file.size}` }
      });
    }
    end = Math.min(end, file.size - 1);
    status = 206;
  }
  const contentLength = end - start + 1;
  const stream = Readable.toWeb(
    createReadStream(file.filePath, { start, end })
  ) as ReadableStream<Uint8Array>;
  return new Response(stream, {
    status,
    headers: {
      "accept-ranges": "bytes",
      "cache-control": "private, no-store",
      "content-length": String(contentLength),
      "content-type": "application/octet-stream",
      "content-disposition": 'inline; filename="theta-comm-encrypted.bin"',
      "content-security-policy": "default-src 'none'",
      "x-content-type-options": "nosniff",
      ...(status === 206
        ? { "content-range": `bytes ${start}-${end}/${file.size}` }
        : {})
    }
  });
}

export async function thetaCommApiError(error: unknown) {
  if (error instanceof ThetaCommError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { "cache-control": "no-store" } }
    );
  }
  await diagnostics.error("theta-comm-v2", "Unhandled Theta-Comm API failure.", {
    error: error instanceof Error ? error.message : "unknown"
  });
  return NextResponse.json(
    { error: "Theta-Comm could not complete that request.", code: "INTERNAL_ERROR" },
    { status: 500, headers: { "cache-control": "no-store" } }
  );
}
