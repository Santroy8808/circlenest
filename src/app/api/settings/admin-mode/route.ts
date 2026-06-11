import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { auth } from "@/auth";
import { ensureBootstrapAdmins, isAdminUser, logAdminAction } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { ADMIN_MODE_COOKIE_NAME, clearAdminModeCookie, createAdminModeCookie, hasAdminModeAccess } from "@/lib/security/admin-mode";
import { validateStrongPassword } from "@/lib/security/password-policy";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureBootstrapAdmins();
  const isAdmin = await isAdminUser(session.user.id);
  if (!isAdmin) return NextResponse.json({ enabled: false, isAdmin: false, hasAdminPassword: false });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { adminPasswordHash: true },
  });

  return NextResponse.json({
    enabled: hasAdminModeAccess(session.user.id, cookies().get(ADMIN_MODE_COOKIE_NAME)?.value),
    isAdmin: true,
    hasAdminPassword: Boolean(user?.adminPasswordHash),
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const body = (await request.json()) as {
    intent?: unknown;
    currentPassword?: unknown;
    adminPassword?: unknown;
    confirmAdminPassword?: unknown;
  };
  const intent = String(body.intent ?? "").trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true, adminPasswordHash: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (intent === "setup") {
    const currentPassword = String(body.currentPassword ?? "");
    const adminPassword = String(body.adminPassword ?? "");
    const confirmAdminPassword = String(body.confirmAdminPassword ?? "");
    if (!currentPassword || !adminPassword || !confirmAdminPassword) {
      return NextResponse.json({ error: "All password fields are required." }, { status: 400 });
    }
    if (!(await compare(currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: "User password incorrect." }, { status: 401 });
    }
    if (adminPassword !== confirmAdminPassword) {
      return NextResponse.json({ error: "Admin passwords do not match." }, { status: 400 });
    }
    if (await compare(adminPassword, user.passwordHash)) {
      return NextResponse.json({ error: "Admin password must be different from your user password." }, { status: 400 });
    }
    const passwordError = validateStrongPassword(adminPassword);
    if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        adminPasswordHash: await hash(adminPassword, 10),
        adminPasswordUpdatedAt: new Date(),
      },
    });
    await logAdminAction({
      actorUserId: session.user.id,
      action: "SET_ADMIN_PASSWORD",
      targetType: "USER",
      targetId: session.user.id,
      note: "Admin password created.",
    });
    return NextResponse.json({ ok: true, hasAdminPassword: true });
  }

  if (intent === "enable") {
    const adminPassword = String(body.adminPassword ?? "");
    if (!user.adminPasswordHash) {
      return NextResponse.json({ error: "Set an admin password first." }, { status: 409 });
    }
    if (!(await compare(adminPassword, user.adminPasswordHash))) {
      return NextResponse.json({ error: "Admin password incorrect." }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true, enabled: true });
    response.cookies.set(createAdminModeCookie(session.user.id));
    await logAdminAction({
      actorUserId: session.user.id,
      action: "ADMIN_MODE_ENABLED",
      targetType: "USER",
      targetId: session.user.id,
      note: "Administrator mode enabled.",
    });
    return response;
  }

  if (intent === "disable") {
    const response = NextResponse.json({ ok: true, enabled: false });
    response.cookies.set(clearAdminModeCookie());
    await logAdminAction({
      actorUserId: session.user.id,
      action: "ADMIN_MODE_DISABLED",
      targetType: "USER",
      targetId: session.user.id,
      note: "Administrator mode disabled.",
    });
    return response;
  }

  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
}
