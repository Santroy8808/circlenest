import { z } from "zod";

export const updateBusinessProfileSchema = z.object({
  businessName: z.string().trim().min(2).max(100),
  tagline: z.string().trim().max(160).optional(),
  description: z.string().trim().max(2400).optional(),
  location: z.string().trim().max(160).optional(),
  publicEmail: z.string().trim().email().max(180).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  website: z.string().trim().url().max(220).optional().or(z.literal("")),
  publicStorefrontEnabled: z.boolean().default(false)
});

export const createBusinessInquirySchema = z.object({
  senderName: z.string().trim().min(2).max(120),
  senderEmail: z.string().trim().email().max(180).optional().or(z.literal("")),
  message: z.string().trim().min(10).max(2000)
});

export type BusinessProfileView = {
  id: string;
  slug: string;
  businessName: string;
  tagline: string | null;
  description: string | null;
  location: string | null;
  publicEmail: string | null;
  phone: string | null;
  website: string | null;
  publicStorefrontEnabled: boolean;
  emailLinkingEnabled: boolean;
  publicUrl: string;
  updatedAt: string;
  owner?: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
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
  profile: BusinessProfileView | null;
  inquiries: BusinessInquiryView[];
};
