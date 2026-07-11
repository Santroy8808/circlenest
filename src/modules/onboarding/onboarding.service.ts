import { ScientologyClassification, ScientologyVisibility, TermsEmailDeliveryStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/platform/db";
import { readPlatformEnv } from "@/lib/platform/env";
import { diagnostics } from "@/lib/platform/logging";
import { sendSmtpMail } from "@/lib/platform/smtp";
import {
  currentTermsSummary,
  getCurrentTermsPdfSha256,
  readCurrentTermsPdf
} from "@/modules/legal/terms";
import { scientologyProcessingStatuses, scientologyTrainingLevels } from "@/modules/my-scientology/types";

const MODULE_KEY = "onboarding";

export const onboardingProfileSchema = z.object({
  displayName: z.string().min(1, "Full name is required.").max(80),
  tagline: z.string().max(140).optional().or(z.literal("")),
  bio: z.string().max(2000).optional().or(z.literal("")),
  location: z.string().min(1, "Location is required.").max(120)
});

export const onboardingScientologySchema = z.object({
  classification: z.nativeEnum(ScientologyClassification).default(ScientologyClassification.PUBLIC),
  orgName: z.string().min(1, "Current org is required.").max(160),
  lastServiceName: z.string().min(1, "Last service is required.").max(160),
  iasMembershipLast6: z.string().regex(/^\d{6}$/, "IAS membership last 6 must be exactly 6 digits.").optional().or(z.literal("")),
  trainingLevel: z.enum(scientologyTrainingLevels).optional().default(""),
  processingStatus: z.enum(scientologyProcessingStatuses).optional().default(""),
  educationNotes: z.string().max(4000).optional().or(z.literal(""))
});

export const goodStandingSchema = z.object({
  isInGoodStanding: z.boolean()
});

export const termsSchema = z.object({
  accepted: z.literal(true, {
    errorMap: () => ({ message: "Terms must be accepted." })
  }),
  signerName: z.string().trim().min(2, "Enter your full name.").max(120, "Name is too long."),
  signerEmail: z.string().trim().email("Enter a valid email address.").max(180, "Email is too long."),
  termsVersion: z.string().trim().min(1, "Terms version is missing.")
});

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateError(value: unknown) {
  const message = value instanceof Error ? value.message : "Could not send SMTP email.";
  return message.slice(0, 500);
}

function termsAcceptanceEmailHtml(input: {
  signerName: string;
  acceptedAtLabel: string;
  termsVersion: string;
  effectiveDateLabel: string;
  pdfSha256: string;
  termsPagePath: string;
}) {
  const env = readPlatformEnv();
  const origin = env.APP_ORIGIN || env.NEXTAUTH_URL || "https://theta-space.net";
  const termsUrl = `${new URL(origin).origin}${input.termsPagePath}`;

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#0b1018;color:#d9e1ef;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1018;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111a28;border:1px solid #806b2c;border-radius:14px;overflow:hidden;">
          <tr><td style="padding:28px 32px 20px;background:#0f1724;border-bottom:1px solid #806b2c;">
            <div style="font-size:13px;letter-spacing:3px;font-weight:bold;color:#ffd34e;">THETA-SPACE</div>
            <h1 style="margin:18px 0 0;color:#f3f6fb;font-size:30px;line-height:1.2;">Your Terms are attached.</h1>
          </td></tr>
          <tr><td style="padding:30px 32px;">
            <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Hello ${escapeHtml(input.signerName)},</p>
            <p style="margin:0 0 22px;font-size:16px;line-height:1.6;">Thank you for completing your Theta-Space membership agreement. The Terms of Service PDF you accepted is attached for your records.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#1a2639;border:1px solid #d3ad3d;border-radius:10px;">
              <tr><td style="padding:18px 20px;">
                <div style="margin-bottom:12px;color:#ffd34e;font-size:13px;font-weight:bold;letter-spacing:2px;">ACCEPTANCE RECORD</div>
                <div style="margin-bottom:7px;color:#d9e1ef;font-size:14px;line-height:1.5;"><strong>Terms version:</strong> ${escapeHtml(input.termsVersion)}</div>
                <div style="margin-bottom:7px;color:#d9e1ef;font-size:14px;line-height:1.5;"><strong>Effective date:</strong> ${escapeHtml(input.effectiveDateLabel)}</div>
                <div style="color:#d9e1ef;font-size:14px;line-height:1.5;"><strong>Accepted:</strong> ${escapeHtml(input.acceptedAtLabel)} UTC</div>
              </td></tr>
            </table>
            <p style="margin:0 0 24px;text-align:center;"><a href="${escapeHtml(termsUrl)}" style="display:inline-block;padding:13px 24px;background:#5d82f5;border-radius:999px;color:#07101e;font-size:16px;font-weight:bold;text-decoration:none;">Review Terms online</a></p>
            <p style="margin:0 0 8px;color:#aeb9ca;font-size:13px;line-height:1.5;">PDF verification</p>
            <p style="margin:0;color:#7f8da3;font-family:Consolas,Monaco,monospace;font-size:11px;line-height:1.5;overflow-wrap:anywhere;word-break:break-all;">SHA-256: ${escapeHtml(input.pdfSha256)}</p>
            <p style="margin:22px 0 0;color:#aeb9ca;font-size:14px;line-height:1.6;">Keep this email and the attached PDF for your records.</p>
          </td></tr>
          <tr><td style="padding:18px 32px;background:#0f1724;color:#7f8da3;font-size:12px;line-height:1.5;">The Theta-Space team</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function getOnboardingState(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      onboardingCompletedAt: true,
      profileOnboardingSkippedAt: true,
      scientologyOnboardingSkippedAt: true,
      termsAcceptedAt: true,
      goodStandingDeniedAt: true,
      profile: {
        select: {
          displayName: true,
          tagline: true,
          bio: true,
          location: true
        }
      },
      scientologyProfile: {
        select: {
          classification: true,
          orgName: true,
          lastServiceName: true,
          iasMembershipLast6: true,
          trainingLevel: true,
          processingStatus: true,
          goodStandingAttested: true,
          educationNotes: true
        }
      }
    }
  });

  if (!user) return null;

  const hasProfile = Boolean(user.profile?.displayName?.trim() && user.profile.location?.trim());
  const hasScientology = Boolean(user.scientologyProfile?.orgName?.trim() && user.scientologyProfile.lastServiceName?.trim());
  const profileStepDone = hasProfile || Boolean(user.profileOnboardingSkippedAt);
  const scientologyStepDone = hasScientology || Boolean(user.scientologyOnboardingSkippedAt);
  const hasGoodStanding = Boolean(user.scientologyProfile?.goodStandingAttested);
  const hasTerms = Boolean(user.termsAcceptedAt);
  const completed = Boolean(user.onboardingCompletedAt && hasGoodStanding && hasTerms);

  return {
    user,
    hasProfile,
    hasScientology,
    profileStepDone,
    scientologyStepDone,
    hasGoodStanding,
    hasTerms,
    completed,
    nextPath: user.goodStandingDeniedAt
      ? "/onboarding/application-complete"
      : !profileStepDone
        ? "/onboarding/profile"
        : !scientologyStepDone
          ? "/onboarding/scientology"
          : !hasGoodStanding
            ? "/onboarding/good-standing"
            : !hasTerms
              ? "/onboarding/terms"
              : null
  };
}

export async function saveOnboardingProfile(userId: string, input: unknown) {
  const parsed = onboardingProfileSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid profile." };
  }

  await prisma.profile.upsert({
    where: { userId },
    update: {
      displayName: parsed.data.displayName,
      tagline: parsed.data.tagline || null,
      bio: parsed.data.bio || null,
      location: parsed.data.location
    },
    create: {
      userId,
      displayName: parsed.data.displayName,
      tagline: parsed.data.tagline || null,
      bio: parsed.data.bio || null,
      location: parsed.data.location
    }
  });

  await diagnostics.info(MODULE_KEY, "Onboarding profile step completed.", { userId });

  return { ok: true as const, nextPath: "/onboarding/scientology" };
}

export async function skipOnboardingProfile(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { profileOnboardingSkippedAt: new Date() }
  });

  await diagnostics.info(MODULE_KEY, "Onboarding profile step skipped.", { userId });

  return { ok: true as const, nextPath: "/onboarding/scientology" };
}

export async function saveOnboardingScientology(userId: string, input: unknown) {
  const parsed = onboardingScientologySchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid My Scientology step." };
  }

  await prisma.scientologyProfile.upsert({
    where: { userId },
    update: {
      classification: parsed.data.classification,
      orgName: parsed.data.orgName,
      lastServiceName: parsed.data.lastServiceName,
      iasMembershipLast6: parsed.data.iasMembershipLast6 || null,
      trainingLevel: parsed.data.trainingLevel || null,
      processingStatus: parsed.data.processingStatus || null,
      educationNotes: parsed.data.educationNotes || null,
      visibility: ScientologyVisibility.PRIVATE
    },
    create: {
      userId,
      classification: parsed.data.classification,
      orgName: parsed.data.orgName,
      lastServiceName: parsed.data.lastServiceName,
      iasMembershipLast6: parsed.data.iasMembershipLast6 || null,
      trainingLevel: parsed.data.trainingLevel || null,
      processingStatus: parsed.data.processingStatus || null,
      educationNotes: parsed.data.educationNotes || null,
      visibility: ScientologyVisibility.PRIVATE
    }
  });

  await diagnostics.info(MODULE_KEY, "Onboarding Scientology step completed.", { userId });

  return { ok: true as const, nextPath: "/onboarding/good-standing" };
}

export async function skipOnboardingScientology(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { scientologyOnboardingSkippedAt: new Date() }
  });

  await diagnostics.info(MODULE_KEY, "Onboarding Scientology step skipped.", { userId });

  return { ok: true as const, nextPath: "/onboarding/good-standing" };
}

export async function saveGoodStandingAttestation(userId: string, input: unknown) {
  const parsed = goodStandingSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: "Choose yes or no." };
  }

  if (!parsed.data.isInGoodStanding) {
    await prisma.user.update({
      where: { id: userId },
      data: { goodStandingDeniedAt: new Date() }
    });

    await diagnostics.info(MODULE_KEY, "Onboarding ended after good-standing denial.", { userId });

    return { ok: true as const, nextPath: "/onboarding/application-complete" };
  }

  await prisma.scientologyProfile.upsert({
    where: { userId },
    update: {
      goodStandingAttested: true,
      goodStandingUpdatedAt: new Date()
    },
    create: {
      userId,
      classification: ScientologyClassification.PUBLIC,
      visibility: ScientologyVisibility.PRIVATE,
      goodStandingAttested: true,
      goodStandingUpdatedAt: new Date()
    }
  });

  await diagnostics.info(MODULE_KEY, "Onboarding good-standing step completed.", { userId });

  return { ok: true as const, nextPath: "/onboarding/terms" };
}

export async function acceptOnboardingTerms(userId: string, input: unknown) {
  const parsed = termsSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Terms must be accepted." };
  }

  const state = await getOnboardingState(userId);

  if (!state || state.user.goodStandingDeniedAt) {
    return { ok: false as const, error: "Application is not eligible for activation." };
  }

  if (!state.hasGoodStanding) {
    return { ok: false as const, error: "Complete the previous onboarding steps first." };
  }

  const terms = currentTermsSummary();
  if (parsed.data.termsVersion !== terms.version) {
    return { ok: false as const, error: "Terms changed. Refresh this page and review the current Terms." };
  }

  const signerEmail = parsed.data.signerEmail.trim().toLowerCase();
  const accountEmail = state.user.email.trim().toLowerCase();
  if (signerEmail !== accountEmail) {
    return { ok: false as const, error: "Enter the email address on this account." };
  }

  const acceptedAt = new Date();
  const pdf = readCurrentTermsPdf();
  const pdfSha256 = getCurrentTermsPdfSha256();
  const signerName = parsed.data.signerName.trim();

  const acceptance = await prisma.$transaction(async (transaction) => {
    const record = await transaction.termsAcceptance.create({
      data: {
        userId,
        termsVersion: terms.version,
        termsEffectiveDate: terms.effectiveDate,
        signerName,
        signerEmail,
        accountEmail,
        acceptedAt,
        pdfPath: terms.pdfPath,
        pdfSha256,
        metadata: {
          pagePath: terms.pagePath,
          pdfFilename: terms.pdfFilename
        }
      }
    });

    await transaction.user.update({
      where: { id: userId },
      data: {
        termsAcceptedAt: acceptedAt,
        onboardingCompletedAt: acceptedAt
      }
    });

    await transaction.auditLog.create({
      data: {
        actorUserId: userId,
        module: MODULE_KEY,
        action: "terms.accepted",
        targetType: "TermsAcceptance",
        targetId: record.id,
        metadata: {
          termsVersion: terms.version,
          pdfSha256,
          signerEmail
        }
      }
    });

    return record;
  });

  try {
    const acceptedAtLabel = new Intl.DateTimeFormat("en-US", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "UTC"
    }).format(acceptedAt);
    const sent = await sendSmtpMail({
      to: signerEmail,
      subject: "Your Theta-Space Terms of Service",
      text: [
        `Hello ${signerName},`,
        "",
        "Thank you for completing your Theta-Space membership agreement.",
        "The Terms of Service PDF you accepted is attached for your records.",
        "",
        `Terms version: ${terms.version}`,
        `Effective date: ${terms.effectiveDateLabel}`,
        `Accepted: ${acceptedAtLabel} UTC`,
        `PDF SHA-256: ${pdfSha256}`,
        "",
        "Keep this email for your records.",
        "",
        "Theta-Space"
      ].join("\n"),
      html: termsAcceptanceEmailHtml({
        signerName,
        acceptedAtLabel,
        termsVersion: terms.version,
        effectiveDateLabel: terms.effectiveDateLabel,
        pdfSha256,
        termsPagePath: terms.pagePath
      }),
      attachments: [
        {
          filename: terms.pdfFilename,
          content: pdf,
          contentType: "application/pdf"
        }
      ]
    });

    await prisma.$transaction([
      prisma.termsAcceptance.update({
        where: { id: acceptance.id },
        data: {
          emailDeliveryStatus: TermsEmailDeliveryStatus.SENT,
          emailSentAt: new Date(),
          emailMessageId: typeof sent.messageId === "string" ? sent.messageId : null
        }
      }),
      prisma.auditLog.create({
        data: {
          actorUserId: userId,
          module: MODULE_KEY,
          action: "terms.pdf_emailed",
          targetType: "TermsAcceptance",
          targetId: acceptance.id,
          metadata: {
            termsVersion: terms.version,
            pdfSha256,
            messageId: typeof sent.messageId === "string" ? sent.messageId : null
          }
        }
      })
    ]);
  } catch (error) {
    const emailError = truncateError(error);

    await prisma.$transaction([
      prisma.termsAcceptance.update({
        where: { id: acceptance.id },
        data: {
          emailDeliveryStatus: TermsEmailDeliveryStatus.FAILED,
          emailError
        }
      }),
      prisma.auditLog.create({
        data: {
          actorUserId: userId,
          module: MODULE_KEY,
          action: "terms.pdf_email_failed",
          targetType: "TermsAcceptance",
          targetId: acceptance.id,
          metadata: {
            termsVersion: terms.version,
            error: emailError
          }
        }
      })
    ]);

    await diagnostics.warn(MODULE_KEY, "Terms PDF SMTP send failed.", {
      userId,
      acceptanceId: acceptance.id,
      error: emailError
    });

    return {
      ok: true as const,
      nextPath: "/home",
      warning: "Account activated, but the Terms PDF email could not be sent. The acceptance was logged."
    };
  }

  await diagnostics.info(MODULE_KEY, "Onboarding completed.", {
    userId,
    acceptanceId: acceptance.id,
    termsVersion: terms.version
  });

  return { ok: true as const, nextPath: "/home" };
}
