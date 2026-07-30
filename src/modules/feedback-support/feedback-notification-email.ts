import { escapeHtml, platformEmailButton, platformWebsiteUrl, renderPlatformEmail } from "@/lib/platform/email-theme";
import { sendPlatformMail } from "@/lib/platform/mail";
import { readPlatformMailboxes } from "@/lib/platform/mailboxes";
import { feedbackTypeLabel } from "@/modules/feedback-support/config";

export type FeedbackNotificationInput = {
  publicId: string;
  title: string;
  description: string;
  kind: string;
  severity: string;
  reporterName: string;
  reporterEmail: string;
  pageUrl?: string | null;
};

export function feedbackTicketQueueUrl(publicId: string) {
  return platformWebsiteUrl(`/admin/tickets?ticket=${encodeURIComponent(publicId)}`);
}

export function buildFeedbackNotificationEmail(input: FeedbackNotificationInput) {
  const queueUrl = feedbackTicketQueueUrl(input.publicId);
  const type = feedbackTypeLabel(input.kind);
  const source = input.pageUrl || "No page address was captured.";
  const subject = `[${input.publicId}] ${type}: ${input.title}`;
  const text = [
    "THETA-SPACE FEEDBACK",
    "====================",
    "",
    `Ticket: ${input.publicId}`,
    `Type: ${type}`,
    `Priority: ${input.severity}`,
    `Submitted by: ${input.reporterName} <${input.reporterEmail}>`,
    `Page: ${source}`,
    "",
    input.title,
    "",
    input.description,
    "",
    `Open in the Theta-Space queue: ${queueUrl}`
  ].join("\n");

  const html = renderPlatformEmail({
    eyebrow: "New feedback ticket",
    title: input.title,
    preheader: `${input.publicId} was added to the Theta-Space feedback queue.`,
    bodyHtml: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:22px 0;background-color:#172133;border:1px solid #334159;border-radius:8px;">
        <tr>
          <td style="padding:18px 20px;color:#dbe2ee;font-size:14px;line-height:1.75;">
            <strong style="color:#ffd85f;">${escapeHtml(input.publicId)}</strong><br>
            <strong>Type:</strong> ${escapeHtml(type)}<br>
            <strong>Priority:</strong> ${escapeHtml(input.severity)}<br>
            <strong>Submitted by:</strong> ${escapeHtml(input.reporterName)} &lt;${escapeHtml(input.reporterEmail)}&gt;<br>
            <strong>Page:</strong> ${escapeHtml(source)}
          </td>
        </tr>
      </table>
      <p style="margin:0 0 26px;color:#c5cfdd;font-size:16px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(input.description)}</p>
      ${platformEmailButton("Open ticket in queue", queueUrl)}
    `
  });

  return { subject, text, html };
}

export async function sendFeedbackNotificationEmail(input: FeedbackNotificationInput) {
  const mailboxes = readPlatformMailboxes();
  await sendPlatformMail({
    to: mailboxes.feedback,
    from: mailboxes.feedback,
    replyTo: mailboxes.feedback,
    ...buildFeedbackNotificationEmail(input)
  });
}
