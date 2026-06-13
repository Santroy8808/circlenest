import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { normalizeStorefrontSlug } from "@/lib/business/storefront";

const inquirySchema = z.object({
  visitorName: z.string().trim().min(2).max(120),
  visitorEmail: z.string().trim().email().max(320),
  visitorMessage: z.string().trim().min(10).max(4000),
});

export async function POST(request: Request, { params }: { params: { slug: string } }) {
  const slug = normalizeStorefrontSlug(params.slug ?? "");
  if (!slug) return NextResponse.json({ error: "Invalid storefront." }, { status: 400 });

  const profile = await prisma.businessProfile.findFirst({
    where: {
      storefrontSlug: slug,
      storefrontEnabled: true,
      isPublic: true,
    },
    select: {
      id: true,
      businessName: true,
      ownerId: true,
      owner: {
        select: {
          id: true,
          username: true,
          fullName: true,
        },
      },
    },
  });

  if (!profile) return NextResponse.json({ error: "Storefront not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = inquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please include your name, email, and a message." }, { status: 400 });
  }

  const inquiry = await prisma.businessStorefrontInquiry.create({
    data: {
      businessProfileId: profile.id,
      visitorName: parsed.data.visitorName,
      visitorEmail: parsed.data.visitorEmail,
      visitorMessage: parsed.data.visitorMessage,
    },
  });

  await prisma.notification.create({
    data: {
      userId: profile.ownerId,
      type: "BUSINESS_INQUIRY",
      body: `${parsed.data.visitorName} sent a storefront inquiry to ${profile.businessName}.`,
      targetUrl: "/production-zone/business/storefront",
    },
  });

  return NextResponse.json({
    ok: true,
    inquiry: {
      id: inquiry.id,
      createdAt: inquiry.createdAt.toISOString(),
    },
  });
}
