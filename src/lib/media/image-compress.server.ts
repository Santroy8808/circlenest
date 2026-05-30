import sharp from "sharp";

export type ServerCompressionResult = {
  buffer: Buffer;
  contentType: string;
  originalBytes: number;
  uploadBytes: number;
  resized: boolean;
  outputType: string;
};

const DEFAULT_MAX_EDGE_PX = 2048;
const DEFAULT_JPEG_QUALITY = 82;
const DEFAULT_WEBP_QUALITY = 82;

function isSupportedImageType(mime: string) {
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/webp";
}

export async function compressImageOnServer(file: File): Promise<ServerCompressionResult | null> {
  if (!isSupportedImageType(file.type)) return null;
  const originalBytes = file.size;

  const input = Buffer.from(await file.arrayBuffer());
  const image = sharp(input, { failOn: "none" });

  // If metadata cannot be read, do not block the upload; return original bytes.
  const metadata = await image.metadata().catch(() => null);
  if (!metadata?.width || !metadata?.height) {
    return {
      buffer: input,
      contentType: file.type,
      originalBytes,
      uploadBytes: originalBytes,
      resized: false,
      outputType: file.type,
    };
  }

  const maxEdge = Math.max(metadata.width, metadata.height);
  const resized = maxEdge > DEFAULT_MAX_EDGE_PX;
  const pipeline = resized ? image.resize(DEFAULT_MAX_EDGE_PX, DEFAULT_MAX_EDGE_PX, { fit: "inside" }) : image;

  // Preserve PNG when the input is PNG to keep transparency; otherwise use JPEG.
  // WebP stays WebP.
  let out: Buffer;
  let contentType: string;
  let outputType: string;
  if (file.type === "image/webp") {
    out = await pipeline.webp({ quality: DEFAULT_WEBP_QUALITY }).toBuffer();
    contentType = "image/webp";
    outputType = "image/webp";
  } else if (file.type === "image/png") {
    out = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    contentType = "image/png";
    outputType = "image/png";
  } else {
    out = await pipeline.jpeg({ quality: DEFAULT_JPEG_QUALITY, mozjpeg: true }).toBuffer();
    contentType = "image/jpeg";
    outputType = "image/jpeg";
  }

  return {
    buffer: out,
    contentType,
    originalBytes,
    uploadBytes: out.length,
    resized,
    outputType,
  };
}

