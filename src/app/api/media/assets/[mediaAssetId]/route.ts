import { Readable } from "stream";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import {
  MediaAssetStatus,
  MediaVisibility,
  ProfileVisibility,
  ScientologyVisibility,
  SocialRelationshipType
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { prisma } from "@/lib/platform/db";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { getR2Client, readR2Config } from "@/lib/platform/r2";
import { timeServerStep } from "@/lib/platform/server-timing";
import { canViewerAccessPrivateFeedMediaAsset } from "@/modules/feed-stream/feed-media-authorization";
import { authorizeMediaAccess, mediaAssetDeliveryPath } from "@/modules/media/media-authorization";

function toWebStream(body: unknown) {
  if (body && typeof (body as { transformToWebStream?: unknown }).transformToWebStream === "function") {
    return (body as { transformToWebStream: () => ReadableStream }).transformToWebStream();
  }

  return Readable.toWeb(body as Readable);
}

function parseByteRange(value: string | null) {
  if (!value) return { ok: true as const, value: undefined };
  if (value.length > 128 || value.includes(",")) return { ok: false as const };

  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return { ok: false as const };

  const start = match[1] ? Number(match[1]) : null;
  const end = match[2] ? Number(match[2]) : null;
  if (
    (start !== null && (!Number.isSafeInteger(start) || start < 0)) ||
    (end !== null && (!Number.isSafeInteger(end) || end < 0)) ||
    (start !== null && end !== null && end < start) ||
    (start === null && end === 0)
  ) {
    return { ok: false as const };
  }

  return { ok: true as const, value };
}

function safeContentType(value: string) {
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(value)
    ? value
    : "application/octet-stream";
}

function contentDisposition(fileName: string | null, mimeType: string) {
  const normalized = (fileName || "media")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f"\\/]/g, "_")
    .trim()
    .slice(0, 180) || "media";
  const ascii = normalized.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(normalized).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  const disposition = /^(?:image|audio|video)\//.test(mimeType) || mimeType === "application/pdf" ? "inline" : "attachment";

  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function isRangeError(error: unknown) {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate?.name === "InvalidRange" || candidate?.$metadata?.httpStatusCode === 416;
}

function profileVisibilityAllows(visibility: ProfileVisibility, viewerUserId: string | null, ownerUserId: string) {
  return (
    visibility === ProfileVisibility.PUBLIC ||
    (visibility === ProfileVisibility.MEMBERS && Boolean(viewerUserId)) ||
    viewerUserId === ownerUserId
  );
}

async function identityMediaAccess(mediaAssetId: string, ownerUserId: string, viewerUserId: string | null) {
  const deliveryPath = mediaAssetDeliveryPath(mediaAssetId);
  const [profile, resume, commendation] = await Promise.all([
    prisma.profile.findFirst({
      where: {
        userId: ownerUserId,
        user: { deactivatedAt: null },
        OR: [{ avatarUrl: deliveryPath }, { bannerUrl: deliveryPath }]
      },
      select: { visibility: true }
    }),
    prisma.userResume.findFirst({
      where: {
        userId: ownerUserId,
        user: { deactivatedAt: null },
        uploadedResumeUrl: deliveryPath
      },
      select: { visibility: true }
    }),
    prisma.scientologyCommendation.findFirst({
      where: {
        mediaAssetId,
        profile: { userId: ownerUserId, user: { deactivatedAt: null } }
      },
      select: { profile: { select: { visibility: true } } }
    })
  ]);

  return Boolean(
    (profile && profileVisibilityAllows(profile.visibility, viewerUserId, ownerUserId)) ||
    (resume && profileVisibilityAllows(resume.visibility, viewerUserId, ownerUserId)) ||
    (commendation &&
      (commendation.profile.visibility === ScientologyVisibility.MEMBERS
        ? Boolean(viewerUserId)
        : viewerUserId === ownerUserId))
  );
}

async function hasAuthorizedPrivateContext(
  mediaAssetId: string,
  ownerUserId: string,
  viewerUserId: string
) {
  const blocked = await prisma.socialRelationship.findFirst({
    where: {
      type: SocialRelationshipType.BLOCK,
      OR: [
        { fromUserId: viewerUserId, toUserId: ownerUserId },
        { fromUserId: ownerUserId, toUserId: viewerUserId }
      ]
    },
    select: { id: true }
  });
  if (blocked) return false;

  const [groupAccess, chatParticipation, mailAccess, feedAccess, identityAccess] = await Promise.all([
    prisma.group.findFirst({
      where: {
        archivedAt: null,
        AND: [
          {
            OR: [
              { visibility: "PUBLIC" },
              { members: { some: { userId: viewerUserId } } }
            ]
          },
          {
            OR: [
              { assets: { some: { mediaAssetId, deletedAt: null } } },
              {
                forumThreads: {
                  some: {
                    deletedAt: null,
                    posts: { some: { mediaAssetId, deletedAt: null } }
                  }
                }
              }
            ]
          }
        ]
      },
      select: { id: true }
    }),
    prisma.chatParticipant.findFirst({
      where: {
        userId: viewerUserId,
        archivedAt: null,
        thread: {
          messages: {
            some: {
              deletedAt: null,
              sender: { deactivatedAt: null },
              attachments: { some: { mediaAssetId } }
            }
          }
        }
      },
      select: { id: true }
    }),
    prisma.mailAttachment.findFirst({
      where: {
        mediaAssetId,
        message: {
          deletedAt: null,
          OR: [
            { senderUserId: viewerUserId },
            { recipients: { some: { userId: viewerUserId, deletedAt: null } } }
          ]
        }
      },
      select: { id: true }
    }),
    canViewerAccessPrivateFeedMediaAsset(mediaAssetId, viewerUserId),
    identityMediaAccess(mediaAssetId, ownerUserId, viewerUserId)
  ]);

  return Boolean(groupAccess || chatParticipation || mailAccess || feedAccess || identityAccess);
}

function mediaFallbackSvg(label?: string | null) {
  const safeLabel = (label ?? "Image unavailable").replace(/[<>&"]/g, "");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640" role="img" aria-label="${safeLabel}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#101827"/>
      <stop offset="1" stop-color="#07101b"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" x2="1">
      <stop offset="0" stop-color="#ffe681"/>
      <stop offset="1" stop-color="#d6a82e"/>
    </linearGradient>
  </defs>
  <rect width="960" height="640" fill="url(#bg)"/>
  <rect x="28" y="28" width="904" height="584" rx="34" fill="none" stroke="#d6b24a" stroke-opacity=".42" stroke-width="3"/>
  <circle cx="480" cy="262" r="76" fill="none" stroke="url(#gold)" stroke-width="18"/>
  <path d="M404 334h152M480 186v152" stroke="url(#gold)" stroke-width="18" stroke-linecap="round" opacity=".72"/>
  <text x="480" y="442" fill="#f6d965" font-family="Arial, sans-serif" font-size="34" font-weight="700" text-anchor="middle">Image unavailable</text>
  <text x="480" y="488" fill="#b8c0d4" font-family="Arial, sans-serif" font-size="22" text-anchor="middle">The original media could not be loaded.</text>
</svg>`;
}

async function getMediaViewerUserId(request: NextRequest) {
  const session = await timeServerStep("api.media.asset.auth", auth());

  if (session?.user && !session.user.revoked) {
    const actor = await timeServerStep("api.media.asset.actor", getActiveAccountActor(session.user.id));
    return actor.actorUserId;
  }

  const mobileSession = await timeServerStep("api.media.asset.mobile-auth", requireMobileSession(request));
  return mobileSession?.user.id ?? null;
}

export async function GET(request: NextRequest, { params }: { params: { mediaAssetId: string } }) {
  if (/^Bearer\s+/i.test(request.headers.get("authorization") ?? "")) {
    const unavailable = mobileAuthUnavailableResponse();
    if (unavailable) return unavailable;
  }

  const viewerUserId = await getMediaViewerUserId(request);

  if (!params.mediaAssetId || params.mediaAssetId.length > 128) {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }

  const asset = await timeServerStep("api.media.asset.lookup", prisma.mediaAsset.findUnique({
    where: { id: params.mediaAssetId, status: MediaAssetStatus.READY },
    select: {
      ownerUserId: true,
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
      originalName: true,
      visibility: true
    }
  }));

  if (!asset) {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }

  let authorizedPrivateMemberUserIds: string[] | undefined;
  let anonymousIdentityAccess = false;
  if (
    viewerUserId &&
    asset.visibility === MediaVisibility.PRIVATE &&
    asset.ownerUserId !== viewerUserId &&
    (await hasAuthorizedPrivateContext(params.mediaAssetId, asset.ownerUserId, viewerUserId))
  ) {
    authorizedPrivateMemberUserIds = [viewerUserId];
  } else if (!viewerUserId && asset.visibility === MediaVisibility.PRIVATE) {
    anonymousIdentityAccess = await identityMediaAccess(params.mediaAssetId, asset.ownerUserId, null);
  }

  const access = authorizeMediaAccess({ asset, viewerUserId, authorizedPrivateMemberUserIds });

  if (!access.allowed && !anonymousIdentityAccess) {
    return viewerUserId
      ? NextResponse.json({ error: "Media not found." }, { status: 404 })
      : NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const range = parseByteRange(request.headers.get("range"));
  if (!range.ok) {
    return new NextResponse(null, {
      status: 416,
      headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes */${asset.sizeBytes}` }
    });
  }

  try {
    const r2 = readR2Config();
    const bucket = asset.visibility === MediaVisibility.PUBLIC ? r2.bucket : r2.privateBucket;
    if (!bucket) {
      return NextResponse.json({ error: "Media storage is unavailable." }, { status: 503 });
    }

    const object = await timeServerStep(
      "api.media.asset.r2",
      getR2Client().send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: asset.storageKey,
          Range: range.value
        })
      ),
      { mimeType: asset.mimeType }
    );
    if (!object.Body) throw new Error("Storage returned an empty media body.");

    const mimeType = safeContentType(asset.mimeType);
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": asset.visibility === MediaVisibility.PUBLIC ? "public, max-age=300" : "private, no-store",
      "Content-Disposition": contentDisposition(asset.originalName, mimeType),
      "Content-Type": mimeType,
      "X-Content-Type-Options": "nosniff"
    });

    if (object.ContentLength !== undefined) headers.set("Content-Length", String(object.ContentLength));
    if (object.ContentRange) headers.set("Content-Range", object.ContentRange);
    if (object.ETag) headers.set("ETag", object.ETag);
    if (object.LastModified) headers.set("Last-Modified", object.LastModified.toUTCString());

    return new NextResponse(toWebStream(object.Body) as BodyInit, {
      status: object.ContentRange ? 206 : 200,
      headers
    });
  } catch (error) {
    console.error("[media.assets.get]", error);
    if (isRangeError(error)) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes */${asset.sizeBytes}` }
      });
    }

    if (!range.value && asset.mimeType.startsWith("image/")) {
      return new NextResponse(mediaFallbackSvg(asset.originalName), {
        headers: {
          "Cache-Control": asset.visibility === MediaVisibility.PUBLIC ? "public, max-age=60" : "private, no-store",
          "Content-Disposition": contentDisposition(asset.originalName, "image/svg+xml"),
          "Content-Type": "image/svg+xml; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "X-Theta-Media-Fallback": "true"
        }
      });
    }

    return NextResponse.json({ error: "Could not load media." }, { status: 502 });
  }
}
