import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { createSecureAreaCookie, isSecureAreaRoute } from "@/lib/security/secure-area";

const unlockSchema = z.object({
  password: z.string().min(8).max(72),
  next: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = request.headers.get("content-type") ?? "";
  const payload =
    contentType.includes("application/json")
      ? await request.json().catch(() => ({}))
      : Object.fromEntries((await request.formData()).entries());
  const parsed = unlockSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const valid = await compare(parsed.data.password, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Password incorrect." }, { status: 401 });

  const next = parsed.data.next && isSecureAreaRoute(parsed.data.next) ? parsed.data.next : "/settings";
  const response = contentType.includes("application/json")
    ? NextResponse.json({ ok: true, next })
    : NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(createSecureAreaCookie(session.user.id));
  return response;
}
