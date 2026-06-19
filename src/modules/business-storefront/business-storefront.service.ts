import { MailDeliveryKind, MailRecipientType, MarketListingStatus, Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { marketCategoryLabels, type MarketListingCardView } from "@/modules/market/types";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
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
    coverImageUrl: article.coverMediaAsset?.publicUrl ?? null,
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
    thumbnailUrl: thumbnail?.mediaAsset.publicUrl,
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

async function getPublishedStorefrontBlogs(ownerUserId: string, profileSlug: string) {
  const blogs = await prisma.writerManuscript.findMany({
    where: {
      authorUserId: ownerUserId,
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
  storefrontBlogs: StorefrontBlogView[] = []
): BusinessProfileView {
  return {
    id: profile.id,
    slug: profile.slug,
    businessName: profile.businessName,
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
    publicStorefrontEnabled: profile.publicStorefrontEnabled,
    emailLinkingEnabled: profile.emailLinkingEnabled,
    publicUrl: publicUrl(profile.slug),
    updatedAt: profile.updatedAt.toISOString(),
    marketListings,
    storefrontBlogs,
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
    select: { role: true }
  });

  if (!user) return { allowed: false, reason: "User was not found." };
  if (user.role === UserRole.ADMIN) return { allowed: true, reason: "Admin role can manage business profiles." };

  return canUserAccessFeature(userId, "market.storefront");
}

async function verifyBusinessImage(userId: string, mediaAssetId?: string | null) {
  if (!mediaAssetId) return { ok: true as const, mediaAssetId: null };

  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaAssetId,
      ownerUserId: userId,
      mimeType: {
        startsWith: "image/"
      }
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
  const [access, profile] = await Promise.all([
    canManageBusinessProfile(userId),
    prisma.businessProfile.findUnique({
      where: { ownerUserId: userId },
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
    })
  ]);

  const [marketListings, storefrontBlogs] = profile
    ? await Promise.all([
        getActiveBusinessMarketListings(profile.ownerUserId),
        profile.blogEnabled ? getPublishedStorefrontBlogs(profile.ownerUserId, profile.slug) : Promise.resolve([])
      ])
    : [[], []];

  return {
    canManage: access.allowed,
    reason: access.reason,
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
    return { ok: false as const, error: access.reason ?? "Professional access required." };
  }

  const existing = await prisma.businessProfile.findUnique({
    where: { ownerUserId: userId },
    select: { id: true, slug: true }
  });
  const data = {
    businessName: parsed.data.businessName,
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
          ownerUserId: userId
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

  await diagnostics.info(MODULE_KEY, "Business profile saved.", {
    userId,
    businessProfileId: profile.id,
    publicStorefrontEnabled: profile.publicStorefrontEnabled
  });
  await writeAuditLog({
    actorUserId: userId,
    module: MODULE_KEY,
    action: "business.profile.saved",
    targetType: "BusinessProfile",
    targetId: profile.id,
    metadata: {
      publicStorefrontEnabled: profile.publicStorefrontEnabled
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

  const [marketListings, storefrontBlogs] = await Promise.all([
    getActiveBusinessMarketListings(profile.ownerUserId),
    profile.blogEnabled ? getPublishedStorefrontBlogs(profile.ownerUserId, profile.slug) : Promise.resolve([])
  ]);

  return { ok: true as const, profile: toBusinessProfileView(profile, marketListings, storefrontBlogs) };
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
    return { ok: false as const, error: access.reason ?? "Professional access required." };
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerUserId: userId },
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
      ownerUserId: userId,
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

  const blog = await prisma.writerManuscript.findFirst({
    where: {
      slug: manuscriptSlug,
      authorUserId: profile.ownerUserId,
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
      ownerUserId: true
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
    ownerUserId: profile.ownerUserId,
    inquiryId: inquiry.id,
    mailThreadId: inquiry.mailThreadId
  });

  return { ok: true as const, inquiry: toInquiryView(inquiry) };
}
