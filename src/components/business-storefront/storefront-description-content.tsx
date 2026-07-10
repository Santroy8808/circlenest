"use client";

import { InAppImageViewer } from "@/components/media/in-app-image-viewer";

type StorefrontDescriptionContentProps = {
  businessName: string;
  description: string | null;
  fallback: string;
  imageUrls: string[];
  preview?: boolean;
};

type DescriptionBlock =
  | {
      kind: "paragraph";
      text: string;
    }
  | {
      align: "left" | "center" | "right";
      imageIndex: number;
      kind: "image";
      url: string;
    };

const IMAGE_TOKEN_PATTERN = /^\[image:(\d+)(?:\s+align=(left|center|right))?\]$/i;

export function inlineImageToken(imageIndex: number, align: "left" | "center" | "right") {
  return `[image:${imageIndex + 1} align=${align}]`;
}

function parseDescription(description: string | null, imageUrls: string[]): DescriptionBlock[] {
  const text = description?.trim();
  if (!text) return [];

  const blocks: DescriptionBlock[] = [];
  const paragraphLines: string[] = [];

  function flushParagraph() {
    const paragraph = paragraphLines.join("\n").trim();
    if (paragraph) blocks.push({ kind: "paragraph", text: paragraph });
    paragraphLines.length = 0;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    const imageMatch = IMAGE_TOKEN_PATTERN.exec(trimmedLine);

    if (!trimmedLine) {
      flushParagraph();
      continue;
    }

    if (imageMatch) {
      flushParagraph();
      const imageIndex = Number(imageMatch[1]) - 1;
      const url = imageUrls[imageIndex];
      if (url) {
        blocks.push({
          align: (imageMatch[2]?.toLowerCase() as "left" | "center" | "right" | undefined) ?? "center",
          imageIndex,
          kind: "image",
          url
        });
      }
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  return blocks;
}

export function StorefrontDescriptionContent({
  businessName,
  description,
  fallback,
  imageUrls,
  preview = false
}: StorefrontDescriptionContentProps) {
  const blocks = parseDescription(description, imageUrls);
  const usedImageIndexes = new Set(blocks.filter((block): block is Extract<DescriptionBlock, { kind: "image" }> => block.kind === "image").map((block) => block.imageIndex));
  const unplacedImageBlocks = imageUrls
    .map((url, imageIndex) => ({ align: "center" as const, imageIndex, kind: "image" as const, url }))
    .filter((block) => !usedImageIndexes.has(block.imageIndex));
  const renderedBlocks: DescriptionBlock[] = blocks.length > 0 ? [...blocks, ...unplacedImageBlocks] : [{ kind: "paragraph", text: fallback }, ...unplacedImageBlocks];

  if (blocks.length === 0 && unplacedImageBlocks.length === 0) {
    return <p className="storefront-description-paragraph">{fallback}</p>;
  }

  return (
    <div className={preview ? "storefront-description-content storefront-description-preview" : "storefront-description-content"}>
      {renderedBlocks.map((block, index) => {
        if (block.kind === "paragraph") {
          return (
            <p className="storefront-description-paragraph" key={`paragraph-${index}`}>
              {block.text}
            </p>
          );
        }

        return (
          <figure className={`storefront-inline-image storefront-inline-image-${block.align}`} key={`image-${block.imageIndex}-${index}`}>
            <InAppImageViewer alt={`${businessName} storefront image ${block.imageIndex + 1}`} src={block.url}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={`${businessName} storefront image ${block.imageIndex + 1}`} src={block.url} />
            </InAppImageViewer>
          </figure>
        );
      })}
    </div>
  );
}
