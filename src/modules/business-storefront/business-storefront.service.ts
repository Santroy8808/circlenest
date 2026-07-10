import {
  BusinessProfileKind,
  MailDeliveryKind,
  MailRecipientType,
  MarketListingStatus,
  MediaAssetStatus,
  MediaVisibility,
  MembershipTier,
  Prisma,
  UserRole
} from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { isAdminRole } from "@/lib/platform/roles";
import { sendSmtpMail } from "@/lib/platform/smtp";
import { ensureBusinessAccountForOwner, getBusinessAccountForOwner } from "@/modules/business-accounts/business-accounts.service";
import { marketCategoryLabels, type MarketListingCardView } from "@/modules/market/types";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import { listStorefrontForumTopics } from "@/modules/storefront-forum/storefront-forum.service";
import type { StorefrontForumTopicListItemView } from "@/modules/storefront-forum/types";
import {
  createBusinessArticleSchema,
  createBusinessInquirySchema,
  updateBusinessProfileSchema,
  type BusinessArticleView,
  type BusinessCenterView,
  type BusinessInquiryView,
  type BusinessProfileView,
  type StorefrontBlogDetailView,
  type StorefrontBlogView
} from "@/modules/business-storefront/types";

const MODULE_KEY = "business-storefront";
const STOREFRONT_INQUIRY_EMAIL = "storefront-inquiries@theta-space.net";
const STOREFRONT_INQUIRY_USERNAME = "storefront-inquiries";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function uniqueBusinessSlug(name: string) {
  const base = slugify(name) || "business";
  let candidate = base;
  let index = 2;

  while (await prisma.businessProfile.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

async function uniqueArticleSlug(title: string) {
  const base = slugify(title) || "article";
  let candidate = base;
  let index = 2;

  while (await prisma.businessArticle.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

function profileName(user: { username: string; profile: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username;
}

function publicUrl(slug: string) {
  return `/storefront/${slug}`;
}

function mediaAssetUrl(
  mediaAsset?: {
    id: string;
    publicUrl: string | null;
    status: MediaAssetStatus;
    visibility: MediaVisibility;
    mimeType: string;
  } | null
) {
  if (
    !mediaAsset ||
    mediaAsset.status !== MediaAssetStatus.READY ||
    mediaAsset.visibility !== MediaVisibility.PUBLIC ||
    !/^(?:image\/(?:jpeg|png|webp|gif))$/i.test(mediaAsset.mimeType)
  ) {
    return null;
  }

  return mediaAsset.publicUrl ?? `/api/media/assets/${mediaAsset.id}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type BusinessProfilePayload = Prisma.BusinessProfileGetPayload<{
  include: {
    owner: { include: { profile: true } };
    articles: { include: { coverMediaAsset: true } };
  };
}>;

type BusinessArticlePayload = Prisma.BusinessArticleGetPayload<{
  include: {
    coverMediaAsset: true;
  };
}>;

type StorefrontBlogPayload = Prisma.WriterManuscriptGetPayload<{
  include: {
    chapters: true;
  };
}>;

type StorefrontMarketListingPayload = Prisma.MarketListingGetPayload<{
  include: {
    seller: { include: { profile: true } };
    photos: { include: { mediaAsset: true } };
  };
}>;

function articlePublicUrl(profileSlug: string, articleSlug: string) {
  return `/storefront/${profileSlug}/articles/${articleSlug}`;
}

function blogPublicUrl(profileSlug: string, manuscriptSlug: string) {
  return `/storefront/${profileSlug}/blogs/${manuscriptSlug}`;
}

function toBusinessArticleView(article: BusinessArticlePayload, profileSlug: string, includeBody = false): BusinessArticleView {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    body: includeBody ? article.body : undefined,
    coverImageUrl: mediaAssetUrl(article.coverMediaAsset),
    publicUrl: articlePublicUrl(profileSlug, article.slug),
    published: article.published,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString()
  };
}

function toStorefrontBlogView(blog: StorefrontBlogPayload, profileSlug: string): StorefrontBlogView {
  return {
    id: blog.id,
    slug: blog.slug,
    title: blog.title,
    genre: blog.genre,
    summary: blog.summary,
    chapterCount: blog.chapters.length,
    wordCount: blog.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
    updatedAt: blog.updatedAt.toISOString(),
    publicUrl: blogPublicUrl(profileSlug, blog.slug)
  };
}

function toStorefrontBlogDetailView(blog: StorefrontBlogPayload, profileSlug: string): StorefrontBlogDetailView {
  return {
    ...toStorefrontBlogView(blog, profileSlug),
    chapters: blog.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      bodyText: chapter.bodyText,
      bodyHtml: chapter.bodyHtml,
      wordCount: chapter.wordCount,
      updatedAt: chapter.updatedAt.toISOString()
    }))
  };
}

function toStorefrontMarketListingView(listing: StorefrontMarketListingPayload): MarketListingCardView {
  const thumbnail = listing.photos.sort((first, second) => first.sortOrder - second.sortOrder)[0];

  return {
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    category: listing.category,
    categoryLabel: marketCategoryLabels[listing.category],
    location: listing.location,
    priceCents: listing.priceCents,
    currency: listing.currency,
    status: listing.status,
    expiresAt: listing.expiresAt?.toISOString(),
    createdAt: listing.createdAt.toISOString(),
    thumbnailUrl: mediaAssetUrl(thumbnail?.mediaAsset),
    seller: {
      id: listing.seller.id,
      username: listing.seller.username,
      displayName: profileName(listing.seller),
      avatarUrl: listing.seller.profile?.avatarUrl ?? null
    }
  };
}

async function getActiveBusinessMarketListings(ownerUserId: string) {
  const listings = await prisma.marketListing.findMany({
    where: {
      sellerUserId: ownerUserId,
      status: MarketListingStatus.ACTIVE,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
    },
    include: {
      seller: {
        include: {
          profile: true
        }
      },
      photos: {
        include: {
          mediaAsset: true
        },
        orderBy: {
          sortOrder: "asc"
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 24
  });

  return listings.map(toStorefrontMarketListingView);
}

async function getStorefrontBlogAuthorUserIds(ownerUserId: string) {
  const account = await prisma.businessAccount.findFirst({
    where: {
      businessUserId: ownerUserId,
      active: true
    },
    select: {
      privateUserId: true
    }
  });

  return [
    ...new Set([ownerUserId, account?.privateUserId].filter((userId): userId is string => Boolean(userId)))
  ];
}

async function getPublishedStorefrontBlogs(ownerUserId: string, profileSlug: string) {
  const authorUserIds = await getStorefrontBlogAuthorUserIds(ownerUserId);
  const blogs = await prisma.writerManuscript.findMany({
    where: {
      authorUserId: {
        in: authorUserIds
      },
      publishToStorefront: true
    },
    include: {
      chapters: {
        orderBy: {
          sortOrder: "asc"
        }
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: 12
  });

  return blogs.map((blog) => toStorefrontBlogView(blog, profileSlug));
}

function toBusinessProfileView(
  profile: BusinessProfilePayload,
  marketListings: MarketListingCardView[] = [],
  storefrontBlogs: StorefrontBlogView[] = [],
  forumTopics: StorefrontForumTopicListItemView[] = []
): BusinessProfileView {
  return {
    id: profile.id,
    slug: profile.slug,
    profileKind: profile.profileKind,
    businessName: profile.businessName,
    contactPersonName: profile.contactPersonName,
    tagline: profile.tagline,
    description: profile.description,
    location: profile.location,
    publicEmail: profile.publicEmail,
    phone: profile.phone,
    website: profile.website,
    logoUrl: profile.logoUrl,
    bannerUrl: profile.bannerUrl,
    heroImageUrl: profile.heroImageUrl,
    galleryImageUrls: profile.galleryImageUrls,
    blogEnabled: profile.blogEnabled,
    forumEnabled: profile.forumEnabled,
    forumAllowPictureUploads: profile.forumAllowPictureUploads,
    publicStorefrontEnabled: profile.publicStorefrontEnabled,
    emailLinkingEnabled: profile.emailLinkingEnabled,
    publicUrl: publicUrl(profile.slug),
    updatedAt: profile.updatedAt.toISOString(),
    marketListings,
    storefrontBlogs,
    forumTopics,
    articles: profile.articles.map((article) => toBusinessArticleView(article, profile.slug)),
    owner: {
      username: profile.owner.username,
      displayName: profileName(profile.owner),
      avatarUrl: profile.owner.profile?.avatarUrl ?? null
    }
  };
}

function toInquiryView(inquiry: {
  id: string;
  senderName: string;
  senderEmail: string | null;
  message: string;
  status: "NEW" | "READ" | "ARCHIVED";
  createdAt: Date;
}): BusinessInquiryView {
  return {
    id: inquiry.id,
    senderName: inquiry.senderName,
    senderEmail: inquiry.senderEmail,
    message: inquiry.message,
    status: inquiry.status,
    createdAt: inquiry.createdAt.toISOString()
  };
}

async function canManageBusinessProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      membership: {
        select: {
          tier: true
        }
      }
    }
  });

  if (!user) return { allowed: false, reason: "User was not found." };
  if (isAdminRole(user.role)) return { allowed: true, reason: "Admin role can manage business profiles." };

  const businessAccess = await canUserAccessFeature(userId, "market.storefront");
  if (businessAccess.allowed) return businessAccess;

  return canUserAccessFeature(userId, "org.profile");
}

async function getBusinessProfileKind(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      membership: {
        select: {
          tier: true
        }
      }
    }
  });

  return user?.membership?.tier === MembershipTier.ORG ? BusinessProfileKind.ORG : BusinessProfileKind.BUSINESS;
}

async function verifyBusinessImage(userId: string, mediaAssetId?: string | null) {
  if (!mediaAssetId) return { ok: true as const, mediaAssetId: null };

  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaAssetId,
      ownerUserId: userId,
      status: MediaAssetStatus.READY,
      visibility: MediaVisibility.PUBLIC,
      mimeType: { in: ["image/jpeg", "image/png", "image/webp", "image/gif"] }
    },
    select: {
      id: true
    }
  });

  if (!asset) {
    return { ok: false as const, error: "That image could not be used." };
  }

  return { ok: true as const, mediaAssetId: asset.id };
}

async function ensureStorefrontInquirySender(tx: Prisma.TransactionClient) {
  return tx.user.upsert({
    where: {
      email: STOREFRONT_INQUIRY_EMAIL
    },
    update: {},
    create: {
      email: STOREFRONT_INQUIRY_EMAIL,
      username: STOREFRONT_INQUIRY_USERNAME,
      role: UserRole.MEMBER,
      emailVerified: new Date(),
      profile: {
        create: {
          displayName: "Storefront Inquiries",
          tagline: "Theta-Space storefront inquiry routing"
        }
      }
    },
    select: {
      id: true
    }
  });
}

export async function getBusinessCenterView(userId: string): Promise<BusinessCenterView> {
  const access = await canManageBusinessProfile(userId);
  const linkedAccount = await getBusinessAccountForOwner(userId);
  const profileOwnerUserId = linkedAccount?.businessUserId ?? userId;
  let profile = await prisma.businessProfile.findUnique({
    where: { ownerUserId: profileOwnerUserId },
    include: {
      owner: {
        include: {
          profile: true
        }
      },
      articles: {
        include: {
          coverMediaAsset: true
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 12
      },
      inquiries: {
        orderBy: {
          createdAt: "desc"
        },
        take: 20
      }
    }
  });

  if (access.allowed && profile && !linkedAccount && profile.ownerUserId === userId) {
    const account = await ensureBusinessAccountForOwner(userId, {
      businessName: profile.businessName,
      tagline: profile.tagline,
      logoUrl: profile.logoUrl,
      bannerUrl: profile.bannerUrl
    });
    profile = await prisma.businessProfile.findUnique({
      where: { ownerUserId: account.businessUserId },
      include: {
        owner: {
          include: {
            profile: true
          }
        },
        articles: {
          include: {
            coverMediaAsset: true
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 12
        },
        inquiries: {
          orderBy: {
            createdAt: "desc"
          },
          take: 20
        }
      }
    });
  }

  const [marketListings, storefrontBlogs] = profile
    ? await Promise.all([
        getActiveBusinessMarketListings(profile.ownerUserId),
        profile.blogEnabled ? getPublishedStorefrontBlogs(profile.ownerUserId, profile.slug) : Promise.resolve([])
      ])
    : [[], []];

  return {
    canManage: access.allowed,
    reason: access.reason,
    profileKind: profile?.profileKind ?? (await getBusinessProfileKind(userId)),
    profile: profile ? toBusinessProfileView(profile, marketListings, storefrontBlogs) : null,
    inquiries: profile?.inquiries.map(toInquiryView) ?? []
  };
}

export async function upsertBusinessProfile(userId: string, input: unknown) {
  const parsed = updateBusinessProfileSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid business profile." };
  }

  const access = await canManageBusinessProfile(userId);

  if (!access.allowed) {
    return { ok: false as const, error: access.reason ?? "Business profile access required." };
  }

  const account = await ensureBusinessAccountForOwner(userId, {
    businessName: parsed.data.businessName,
    tagline: parsed.data.tagline,
    logoUrl: parsed.data.logoUrl,
    bannerUrl: parsed.data.bannerUrl
  });
  const businessUserId = account.businessUserId;
  const existing = await prisma.businessProfile.findUnique({
    where: { ownerUserId: businessUserId },
    select: { id: true, slug: true }
  });
  const profileKind = await getBusinessProfileKind(userId);
  const data = {
    profileKind,
    businessName: parsed.data.businessName,
    contactPersonName: parsed.data.contactPersonName || null,
    tagline: parsed.data.tagline || null,
    description: parsed.data.description || null,
    location: parsed.data.location || null,
    publicEmail: parsed.data.publicEmail || null,
    phone: parsed.data.phone || null,
    website: parsed.data.website || null,
    logoUrl: parsed.data.logoUrl || null,
    bannerUrl: parsed.data.bannerUrl || null,
    heroImageUrl: parsed.data.heroImageUrl || null,
    galleryImageUrls: parsed.data.galleryImageUrls,
    blogEnabled: parsed.data.blogEnabled,
    forumEnabled: parsed.data.forumEnabled,
    forumAllowPictureUploads: parsed.data.forumAllowPictureUploads,
    publicStorefrontEnabled: parsed.data.publicStorefrontEnabled
  };
  const profile = existing
    ? await prisma.businessProfile.update({
        where: { id: existing.id },
        data,
        include: {
          owner: {
            include: {
              profile: true
            }
          },
          articles: {
            include: {
              coverMediaAsset: true
            },
            orderBy: {
              createdAt: "desc"
            },
            take: 12
          }
        }
      })
    : await prisma.businessProfile.create({
        data: {
          ...data,
          slug: await uniqueBusinessSlug(parsed.data.businessName),
          ownerUserId: businessUserId
        },
        include: {
          owner: {
            include: {
              profile: true
            }
          },
          articles: {
            include: {
              coverMediaAsset: true
            },
            orderBy: {
              createdAt: "desc"
            },
            take: 12
          }
        }
      });
  await prisma.profile.upsert({
    where: { userId: businessUserId },
    update: {
      displayName: parsed.data.businessName,
      tagline: parsed.data.tagline || null,
      avatarUrl: parsed.data.logoUrl || null,
      bannerUrl: parsed.data.bannerUrl || null
    },
    create: {
      userId: businessUserId,
      displayName: parsed.data.businessName,
      tagline: parsed.data.tagline || null,
      avatarUrl: parsed.data.logoUrl || null,
      bannerUrl: parsed.data.bannerUrl || null
    }
  });

  await diagnostics.info(MODULE_KEY, "Business profile saved.", {
    userId,
    businessUserId,
    businessProfileId: profile.id,
    profileKind: profile.profileKind,
    publicStorefrontEnabled: profile.publicStorefrontEnabled
  });
  await writeAuditLog({
    actorUserId: userId,
    module: MODULE_KEY,
    action: "business.profile.saved",
    targetType: "BusinessProfile",
    targetId: profile.id,
    metadata: {
      publicStorefrontEnabled: profile.publicStorefrontEnabled,
      profileKind: profile.profileKind
    }
  });

  const storefrontBlogs = profile.blogEnabled ? await getPublishedStorefrontBlogs(profile.ownerUserId, profile.slug) : [];

  return { ok: true as const, profile: toBusinessProfileView(profile, [], storefrontBlogs) };
}

export async function getPublicBusinessProfile(slug: string) {
  const profile = await prisma.businessProfile.findFirst({
    where: {
      slug,
      publicStorefrontEnabled: true
    },
    include: {
      owner: {
        include: {
          profile: true
        }
      },
      articles: {
        where: {
          published: true
        },
        include: {
          coverMediaAsset: true
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 12
      }
    }
  });

  if (!profile) {
    return { ok: false as const, error: "Storefront not found." };
  }

  const [marketListings, storefrontBlogs, forumResult] = await Promise.all([
    getActiveBusinessMarketListings(profile.ownerUserId),
    profile.blogEnabled ? getPublishedStorefrontBlogs(profile.ownerUserId, profile.slug) : Promise.resolve([]),
    profile.forumEnabled ? listStorefrontForumTopics(profile.slug, { limit: 8 }) : Promise.resolve(null)
  ]);

  return {
    ok: true as const,
    profile: toBusinessProfileView(profile, marketListings, storefrontBlogs, forumResult?.ok ? forumResult.forum.topics : [])
  };
}

export async function safeGetPublicBusinessProfile(slug: string) {
  try {
    return await getPublicBusinessProfile(slug);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load public storefront.", {
      slug,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not load storefront." };
  }
}

export async function createBusinessArticle(userId: string, input: unknown) {
  const parsed = createBusinessArticleSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid article." };
  }

  const access = await canManageBusinessProfile(userId);

  if (!access.allowed) {
    return { ok: false as const, error: access.reason ?? "Business profile access required." };
  }

  const account = await getBusinessAccountForOwner(userId);
  const businessUserId = account?.businessUserId ?? userId;
  const profile = await prisma.businessProfile.findUnique({
    where: { ownerUserId: businessUserId },
    select: {
      id: true,
      slug: true
    }
  });

  if (!profile) {
    return { ok: false as const, error: "Create your business profile before publishing articles." };
  }

  const cover = await verifyBusinessImage(userId, parsed.data.coverMediaAssetId || null);

  if (!cover.ok) {
    return cover;
  }

  const article = await prisma.businessArticle.create({
    data: {
      ownerUserId: businessUserId,
      businessProfileId: profile.id,
      coverMediaAssetId: cover.mediaAssetId,
      slug: await uniqueArticleSlug(parsed.data.title),
      title: parsed.data.title,
      summary: parsed.data.summary || null,
      body: parsed.data.body,
      published: parsed.data.published
    },
    include: {
      coverMediaAsset: true
    }
  });

  await diagnostics.info(MODULE_KEY, "Business article created.", {
    userId,
    businessUserId,
    businessProfileId: profile.id,
    businessArticleId: article.id
  });
  await writeAuditLog({
    actorUserId: userId,
    module: MODULE_KEY,
    action: "business.article.created",
    targetType: "BusinessArticle",
    targetId: article.id,
    metadata: {
      businessProfileId: profile.id,
      published: article.published
    }
  });

  return { ok: true as const, article: toBusinessArticleView(article, profile.slug, true) };
}

export async function getPublicBusinessArticle(storefrontSlug: string, articleSlug: string) {
  const article = await prisma.businessArticle.findFirst({
    where: {
      slug: articleSlug,
      published: true,
      businessProfile: {
        slug: storefrontSlug,
        publicStorefrontEnabled: true
      }
    },
    include: {
      coverMediaAsset: true,
      businessProfile: {
        include: {
          owner: {
            include: {
              profile: true
            }
          },
          articles: {
            where: {
              published: true
            },
            include: {
              coverMediaAsset: true
            },
            orderBy: {
              createdAt: "desc"
            },
            take: 12
          }
        }
      }
    }
  });

  if (!article) {
    return { ok: false as const, error: "Article not found." };
  }

  return {
    ok: true as const,
    article: toBusinessArticleView(article, article.businessProfile.slug, true),
    profile: toBusinessProfileView(article.businessProfile)
  };
}

export async function safeGetPublicBusinessArticle(storefrontSlug: string, articleSlug: string) {
  try {
    return await getPublicBusinessArticle(storefrontSlug, articleSlug);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load public storefront article.", {
      storefrontSlug,
      articleSlug,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not load article." };
  }
}

export async function getPublicStorefrontBlog(storefrontSlug: string, manuscriptSlug: string) {
  const profile = await prisma.businessProfile.findFirst({
    where: {
      slug: storefrontSlug,
      publicStorefrontEnabled: true,
      blogEnabled: true
    },
    include: {
      owner: {
        include: {
          profile: true
        }
      },
      articles: {
        where: {
          published: true
        },
        include: {
          coverMediaAsset: true
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 12
      }
    }
  });

  if (!profile) {
    return { ok: false as const, error: "Storefront blog not found." };
  }

  const authorUserIds = await getStorefrontBlogAuthorUserIds(profile.ownerUserId);
  const blog = await prisma.writerManuscript.findFirst({
    where: {
      slug: manuscriptSlug,
      authorUserId: {
        in: authorUserIds
      },
      publishToStorefront: true
    },
    include: {
      chapters: {
        orderBy: {
          sortOrder: "asc"
        }
      }
    }
  });

  if (!blog) {
    return { ok: false as const, error: "Storefront blog not found." };
  }

  const storefrontBlogs = await getPublishedStorefrontBlogs(profile.ownerUserId, profile.slug);

  return {
    ok: true as const,
    profile: toBusinessProfileView(profile, [], storefrontBlogs),
    blog: toStorefrontBlogDetailView(blog, profile.slug)
  };
}

export async function safeGetPublicStorefrontBlog(storefrontSlug: string, manuscriptSlug: string) {
  try {
    return await getPublicStorefrontBlog(storefrontSlug, manuscriptSlug);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load public storefront blog.", {
      storefrontSlug,
      manuscriptSlug,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not load storefront blog." };
  }
}

export async function createBusinessInquiry(slug: string, input: unknown) {
  const parsed = createBusinessInquirySchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid inquiry." };
  }

  const profile = await prisma.businessProfile.findFirst({
    where: {
      slug,
      publicStorefrontEnabled: true
    },
    select: {
      id: true,
      businessName: true,
      ownerUserId: true,
      publicEmail: true,
      profileKind: true
    }
  });

  if (!profile) {
    return { ok: false as const, error: "Storefront not found." };
  }

  const inquiry = await prisma.$transaction(async (tx) => {
    const systemSender = await ensureStorefrontInquirySender(tx);
    const subject = `Inquiry: ${profile.businessName}`;
    const bodyText = [
      `Storefront inquiry for ${profile.businessName}`,
      "",
      `From: ${parsed.data.senderName}`,
      `Email: ${parsed.data.senderEmail || "Not supplied"}`,
      "",
      parsed.data.message
    ].join("\n");
    const thread = await tx.mailThread.create({
      data: {
        subject,
        deliveryKind: MailDeliveryKind.INQUIRY,
        createdByUserId: systemSender.id,
        messages: {
          create: {
            senderUserId: systemSender.id,
            subject,
            bodyText,
            recipients: {
              create: {
                userId: profile.ownerUserId,
                type: MailRecipientType.TO
              }
            }
          }
        }
      },
      include: {
        messages: {
          select: {
            createdAt: true
          },
          take: 1
        }
      }
    });

    await tx.mailThread.update({
      where: {
        id: thread.id
      },
      data: {
        lastMessageAt: thread.messages[0]?.createdAt ?? new Date()
      }
    });

    return tx.businessInquiry.create({
      data: {
        businessProfileId: profile.id,
        mailThreadId: thread.id,
        senderName: parsed.data.senderName,
        senderEmail: parsed.data.senderEmail || null,
        message: parsed.data.message
      }
    });
  });

  await prisma.notification.create({
    data: {
      userId: profile.ownerUserId,
      title: `New storefront inquiry for ${profile.businessName}`,
      body: `${parsed.data.senderName} sent an inquiry.`,
      href: "/mail"
    }
  });

  await diagnostics.info(MODULE_KEY, "Business storefront inquiry created.", {
    businessProfileId: profile.id,
    profileKind: profile.profileKind,
    ownerUserId: profile.ownerUserId,
    inquiryId: inquiry.id,
    mailThreadId: inquiry.mailThreadId
  });

  if (profile.publicEmail) {
    try {
      await sendSmtpMail({
        to: profile.publicEmail,
        subject: `Theta-Space inquiry: ${profile.businessName}`,
        text: [
          `Theta-Space inquiry for ${profile.businessName}`,
          "",
          `From: ${parsed.data.senderName}`,
          `Email: ${parsed.data.senderEmail || "Not supplied"}`,
          "",
          parsed.data.message
        ].join("\n"),
        html: [
          `<p><strong>Theta-Space inquiry for ${escapeHtml(profile.businessName)}</strong></p>`,
          `<p><strong>From:</strong> ${escapeHtml(parsed.data.senderName)}</p>`,
          `<p><strong>Email:</strong> ${escapeHtml(parsed.data.senderEmail || "Not supplied")}</p>`,
          `<p>${escapeHtml(parsed.data.message).replace(/\n/g, "<br />")}</p>`
        ].join("")
      });
    } catch (error) {
      await diagnostics.warn(MODULE_KEY, "Storefront inquiry SMTP send failed.", {
        businessProfileId: profile.id,
        profileKind: profile.profileKind,
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  }

  return { ok: true as const, inquiry: toInquiryView(inquiry) };
}
