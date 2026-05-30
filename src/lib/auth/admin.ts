import { prisma } from "@/lib/db/prisma";

const BOOTSTRAP_ADMIN_EMAILS = new Set([
  "mavnetllc@gmail.com",
  "julianne.dearmon@gmail.com",
]);

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export async function isAdminUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  });
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  return BOOTSTRAP_ADMIN_EMAILS.has(normalizeEmail(user.email));
}

export async function ensureBootstrapAdmins() {
  await prisma.user.updateMany({
    where: { email: { in: Array.from(BOOTSTRAP_ADMIN_EMAILS) } },
    data: { role: "ADMIN" },
  });
}

export async function promoteAdminByEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return prisma.user.update({
    where: { email: normalized },
    data: { role: "ADMIN" },
    select: { id: true, email: true, username: true, role: true },
  });
}

