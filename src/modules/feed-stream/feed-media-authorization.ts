import { MediaAssetStatus, MediaVisibility } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import {
  feedPostWhereForAction,
  resolveFeedViewerPolicy
} from "@/modules/feed-stream/feed-viewer-policy";

export async function canViewerAccessPrivateFeedMediaAsset(
  mediaAssetId: string,
  viewerUserId?: string | null
) {
  const policy = await resolveFeedViewerPolicy(viewerUserId);
  if (!policy.viewerUserId) return false;

  const visiblePostWhere = feedPostWhereForAction(policy, "view");
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaAssetId,
      status: MediaAssetStatus.READY,
      visibility: MediaVisibility.PRIVATE,
      OR: [
        {
          feedPosts: {
            some: visiblePostWhere
          }
        },
        {
          feedComments: {
            some: {
              deletedAt: null,
              author: {
                is: policy.actorWhere
              },
              post: {
                is: visiblePostWhere
              }
            }
          }
        }
      ]
    },
    select: {
      id: true
    }
  });

  return Boolean(asset);
}
