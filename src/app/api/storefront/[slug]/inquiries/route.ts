import { NextResponse } from "next/server";
import { createBusinessInquiry } from "@/modules/business-storefront/business-storefront.service";

export async function POST(request: Request, { params }: { params: { slug: string } }) {
  const body = await request.json();
  const result = await createBusinessInquiry(params.slug, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ inquiry: result.inquiry }, { status: 201 });
}
