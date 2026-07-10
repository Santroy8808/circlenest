import { randomBytes } from "crypto";
import { AccountPurpose, MembershipTier, Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import type { RequestContext } from "@/modules/auth-security/types";
import { createMemberAccount, normalizeIdentifier } from "@/modules/auth-security/auth-security.service";
import { createAuditorHelpAccountSchema } from "@/modules/auditor-help/types";

const MODULE_KEY = "auditor-help";

function generatedUsername() {
  return `help_${randomBytes(5).toString("hex")}`;
}

function generatedPassword() {
  return `Theta-${randomBytes(5).toString("base64url")}!7a`;
}

export async function createAuditorHelpAccount(input: unknown, context?: RequestContext) {
  const parsed = createAuditorHelpAccountSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid help request." };
  }

  const email = normalizeIdentifier(parsed.data.email);

  let username = generatedUsername();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existingUsername = await prisma.user.findUnique({
      where: { username },
      select: { id: true }
    });
    if (!existingUsername) break;
    username = generatedUsername();
  }

  const password = generatedPassword();
  const account = await createMemberAccount(
    {
      email,
      username,
      displayName: parsed.data.fullName,
      password,
      inviteCode: parsed.data.inviteCode
    },
    {
      accountPurpose: AccountPurpose.AUDITOR_SEEKER,
      tier: MembershipTier.FREE,
      preverified: false,
      context
    }
  );

  if (!account.ok) {
    return account;
  }

  try {
    const seekerProfile = await prisma.auditorSeekerProfile.create({
      data: {
        userId: account.user.id,
        fullName: parsed.data.fullName,
        email,
        phone: parsed.data.phone || null,
        resolutionGoal: parsed.data.resolutionGoal || null,
        location: parsed.data.location || null,
        relationship: parsed.data.relationship || null,
        bio: parsed.data.bio || null
      }
    });
    await prisma.user.update({
      where: { id: account.user.id },
      data: {
        onboardingCompletedAt: new Date(),
        termsAcceptedAt: new Date()
      }
    });

    await diagnostics.info(MODULE_KEY, "Auditor help account created.", {
      userId: account.user.id,
      seekerProfileId: seekerProfile.id
    });

    return {
      ok: true as const,
      credentials: {
        username,
        password
      },
      profileId: seekerProfile.id
    };
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not create auditor seeker profile.", {
      userId: account.user.id,
      error: error instanceof Error ? error.message : "unknown"
    });

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false as const, error: "A help profile already exists for that account." };
    }

    return { ok: false as const, error: "Could not save the help profile." };
  }
}
