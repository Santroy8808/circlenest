import { z } from "zod";
import type { BusinessProfileKind } from "@prisma/client";
import type { MarketListingCardView } from "@/modules/market/types";
import type { StorefrontForumTopicListItemView } from "@/modules/storefront-forum/types";

export const updateBusinessProfileSchema = z.object({
  businessName: z.string().trim().min(2).max(100),
  contactPersonName: z.string().trim().max(120).optional(),
  tagline: z.string().trim().max(160).optional(),
  description: z.string().trim().max(6000).optional(),
  location: z.string().trim().max(160).optional(),
  publicEmail: z.string().trim().email().max(180).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  website: z.string().trim().url().max(220).optional().or(z.literal("")),
  logoUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  bannerUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  heroImageUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  galleryImageUrls: z.array(z.string().trim().url().max(500)).max(12).default([]),
  blogEnabled: z.boolean().default(false),
  forumEnabled: z.boolean().default(false),
  forumAllowPictureUploads: z.boolean().default(false),
  publicStorefrontEnabled: z.boolean().default(false)
});

export const createBusinessInquirySchema = z.object({
  senderName: z.string().trim().min(2).max(120),
  senderEmail: z.string().trim().email().max(180).optional().or(z.literal("")),
  message: z.string().trim().min(10).max(2000)
});

export const createBusinessArticleSchema = z.object({
  title: z.string().trim().min(3).max(140),
  summary: z.string().trim().max(320).optional().or(z.literal("")),
  body: z.string().trim().min(20).max(12000),
  coverMediaAssetId: z.string().trim().optional().or(z.literal("")),
  published: z.boolean().default(true)
});

export type BusinessArticleView = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body?: string;
  coverImageUrl: string | null;
  publicUrl: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BusinessProfileView = {
  id: string;
  slug: string;
  profileKind: BusinessProfileKind;
  businessName: string;
  contactPersonName: string | null;
  tagline: string | null;
  description: string | null;
  location: string | null;
  publicEmail: string | null;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  heroImageUrl: string | null;
  galleryImageUrls: string[];
  blogEnabled: boolean;
  forumEnabled: boolean;
  forumAllowPictureUploads: boolean;
  publicStorefrontEnabled: boolean;
  emailLinkingEnabled: boolean;
  publicUrl: string;
  updatedAt: string;
  marketListings: MarketListingCardView[];
  storefrontBlogs: StorefrontBlogView[];
  forumTopics: StorefrontForumTopicListItemView[];
  articles: BusinessArticleView[];
  owner?: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
};

export type StorefrontBlogView = {
  id: string;
  slug: string;
  title: string;
  genre: string | null;
  summary: string | null;
  chapterCount: number;
  wordCount: number;
  updatedAt: string;
  publicUrl: string;
};

export type StorefrontBlogDetailView = StorefrontBlogView & {
  chapters: Array<{
    id: string;
    title: string;
    bodyText: string;
    bodyHtml: string | null;
    wordCount: number;
    updatedAt: string;
  }>;
};

export type BusinessInquiryView = {
  id: string;
  senderName: string;
  senderEmail: string | null;
  message: string;
  status: "NEW" | "READ" | "ARCHIVED";
  createdAt: string;
};

export type BusinessCenterView = {
  canManage: boolean;
  reason?: string;
  profileKind: BusinessProfileKind;
  profile: BusinessProfileView | null;
  inquiries: BusinessInquiryView[];
};
