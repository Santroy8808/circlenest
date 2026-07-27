import { escapeHtml, platformEmailButton, platformWebsiteUrl, renderPlatformEmail } from "@/lib/platform/email-theme";
import { sendPlatformMail } from "@/lib/platform/mail";
import { readPlatformMailboxes } from "@/lib/platform/mailboxes";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";

const MODULE_KEY = "beta-activity-reminders";
const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const BETA_REMINDER_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
export const BETA_REMINDER_EXCLUDED_EMAIL = "mike@santroy.com";

export function buildBetaActivityReminderEmail() {
  const loginUrl = platformWebsiteUrl("/login");
  const safeLoginUrl = escapeHtml(loginUrl);
  const text = [
    "HAVE YOU TESTED THETA-SPACE TODAY?",
    "==================================",
    "",
    "Your feedback is helping shape Theta-Space.",
    "",
    "Please sign in today and spend a few minutes exploring the private Beta. Try a feature, visit a section you have not used yet, or send us feedback about anything that feels missing, broken, or confusing.",
    "",
    "Theta-Space currently works best on a desktop or laptop. The Android app is in development, with iOS to follow.",
    "",
    `Log in: ${loginUrl}`,
    "",
    "Thank you for helping us improve Theta-Space.",
    "",
    "The Theta-Space team"
  ].join("\n");

  const html = renderPlatformEmail({
    eyebrow: "Private Beta",
    title: "Have you tested Theta-Space today?",
    preheader: "Sign in and spend a few minutes helping shape the Theta-Space Beta.",
    bodyHtml: `
      <p style="margin:20px 0;color:#c5cfdd;font-size:16px;line-height:1.7;">Your feedback is helping shape Theta-Space.</p>
      <p style="margin:0 0 22px;color:#c5cfdd;font-size:16px;line-height:1.7;">Please sign in today and spend a few minutes exploring the private Beta. Try a feature, visit a section you have not used yet, or send us feedback about anything that feels missing, broken, or confusing.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 26px;background-color:#172133;border:1px solid #334159;border-radius:12px;">
        <tr>
          <td style="padding:18px 20px;color:#dbe2ee;font-size:15px;line-height:1.7;">
            <strong style="color:#ffd85f;">For the best Beta experience, use a PC.</strong><br>
            Theta-Space currently works best on a desktop or laptop. The Android app is in development, with iOS to follow.
          </td>
        </tr>
      </table>
      ${platformEmailButton("Log in to Theta-Space", loginUrl)}
      <p style="margin:0;color:#7f8da3;font-size:12px;line-height:1.65;">Button not working? Copy and paste this address into your browser:<br><a href="${safeLoginUrl}" style="color:#6d91ff;text-decoration:underline;word-break:break-all;">${safeLoginUrl}</a></p>
      <p style="margin:22px 0 0;color:#aab4c3;font-size:13px;line-height:1.65;">Thank you for helping us improve Theta-Space.</p>
    `,
    footerHtml: "This Beta testing reminder was sent by the Theta-Space team."
  });

  return {
    subject: "Have you tested Theta-Space today?",
    text,
    html
  };
}

async function sendBetaActivityReminder(recipientEmail: string) {
  const mailboxes = readPlatformMailboxes();
  await sendPlatformMail({
    to: recipientEmail,
    from: mailboxes.system,
    replyTo: mailboxes.support,
    ...buildBetaActivityReminderEmail()
  });
}

export async function runBetaActivityReminderSweep(now = new Date()) {
  const inactivityCutoff = new Date(now.getTime() - REMINDER_INTERVAL_MS);
  const candidates = await prisma.user.findMany({
    where: {
      isBetaTester: true,
      deactivatedAt: null,
      email: { not: BETA_REMINDER_EXCLUDED_EMAIL, mode: "insensitive" },
      betaReminderStartedAt: { lte: inactivityCutoff },
      betaReminderEndsAt: { gt: now },
      AND: [
        {
          OR: [
            { betaReminderLastSentAt: null },
            { betaReminderLastSentAt: { lte: inactivityCutoff } }
          ]
        },
        {
          OR: [
            { applicationUsageMetric: { is: null } },
            { applicationUsageMetric: { is: { lastSeenAt: null } } },
            { applicationUsageMetric: { is: { lastSeenAt: { lt: inactivityCutoff } } } }
          ]
        }
      ]
    },
    select: {
      id: true,
      email: true
    },
    orderBy: { betaReminderStartedAt: "asc" },
    take: 100
  });

  let sent = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      await sendBetaActivityReminder(candidate.email);
      await prisma.user.update({
        where: { id: candidate.id },
        data: { betaReminderLastSentAt: new Date() }
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      await diagnostics.warn(MODULE_KEY, "Beta activity reminder email failed.", {
        userId: candidate.id,
        recipientEmail: candidate.email,
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  }

  return { checked: candidates.length, sent, failed };
}
