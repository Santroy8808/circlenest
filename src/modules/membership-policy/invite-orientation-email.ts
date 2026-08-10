import { platformEmailButton, platformWebsiteUrl, renderPlatformEmail } from "@/lib/platform/email-theme";
import { sendPlatformMail } from "@/lib/platform/mail";
import { readPlatformMailboxes } from "@/lib/platform/mailboxes";
import {
  assertOptionalSystemEmailAllowed,
  buildOptionalSystemEmailUnsubscribeHtml,
  buildOptionalSystemEmailUnsubscribeText
} from "@/modules/system-email-preferences/system-email-preferences.service";

export function buildInviteOrientationEmail(recipientEmail?: string | null) {
  const websiteUrl = platformWebsiteUrl("/");
  const unsubscribeText = recipientEmail ? buildOptionalSystemEmailUnsubscribeText(recipientEmail) : "";
  const unsubscribeHtml = recipientEmail ? buildOptionalSystemEmailUnsubscribeHtml(recipientEmail) : "";
  const text = [
    "THETA-SPACE NON-E",
    "=================",
    "",
    "This is a follow-up to your invitation to Theta-Space.",
    "",
    "Theta-Space is a private, member-focused social network for Scientologists. It is independently owned and built, and is not affiliated with or operated by the Church of Scientology.",
    "",
    "Our purpose is to provide a private, disenturbulated place for community connection and communication.",
    "",
    "The beta currently includes member profiles, private communication, community feeds, groups, events, and media sharing. Additional capabilities are actively being built.",
    "",
    "Please use Theta-Space on a desktop or laptop for now and tell us what is missing, broken, or confusing. An Android app is being built, and an iOS app will follow.",
    "",
    "Use the Feedback button on any page to report an issue. It automatically includes the page address, and you can add a screenshot when useful.",
    "",
    `Visit Theta-Space: ${websiteUrl}`,
    "",
    "This is an invite-only beta. Invitations are being sent to people known personally or who have expressed interest through the community.",
    "",
    "Welcome,",
    "Michael De Armon",
    "Owner / Operator, Theta-Space",
    unsubscribeText
  ].join("\n");

  const html = renderPlatformEmail({
    eyebrow: "Private beta orientation",
    title: "Welcome to Theta-Space",
    preheader: "A short orientation for your private Theta-Space beta invitation.",
    bodyHtml: `
      <p style="margin:20px 0;color:#c5cfdd;font-size:16px;line-height:1.7;">This is a follow-up to your invitation to Theta-Space.</p>
      <p style="margin:0 0 20px;color:#c5cfdd;font-size:16px;line-height:1.7;">Theta-Space is a private, member-focused social network for Scientologists. It is independently owned and built, and is not affiliated with or operated by the Church of Scientology.</p>
      <p style="margin:0 0 20px;color:#c5cfdd;font-size:16px;line-height:1.7;">Our purpose is to provide a private, disenturbulated place for community connection and communication.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 24px;background-color:#172133;border:1px solid #334159;border-radius:12px;">
        <tr>
          <td style="padding:18px 20px;color:#dbe2ee;font-size:15px;line-height:1.7;">
            <strong style="color:#ffd85f;">Help us test the beta.</strong><br>
            Please use Theta-Space on a desktop or laptop for now and tell us what is missing, broken, or confusing. An Android app is being built, and an iOS app will follow.
          </td>
        </tr>
      </table>
      <p style="margin:0 0 20px;color:#c5cfdd;font-size:15px;line-height:1.7;">The beta currently includes member profiles, private communication, community feeds, groups, events, and media sharing. Additional capabilities are actively being built.</p>
      <p style="margin:0 0 26px;color:#c5cfdd;font-size:15px;line-height:1.7;">Use the <strong style="color:#f4f7fc;">Feedback</strong> button on any page to report an issue. It automatically includes the page address, and you can add a screenshot when useful.</p>
      ${platformEmailButton("Visit Theta-Space", websiteUrl)}
      <div style="height:1px;background-color:#334159;line-height:1px;">&nbsp;</div>
      <p style="margin:22px 0 0;color:#aab4c3;font-size:13px;line-height:1.65;">This is an invite-only beta. Invitations are being sent to people known personally or who have expressed interest through the community.</p>
      <p style="margin:20px 0 0;color:#dbe2ee;font-size:15px;line-height:1.7;">Welcome,<br><strong>Michael De Armon</strong><br><span style="color:#aab4c3;">Owner / Operator, Theta-Space</span></p>
      ${unsubscribeHtml}
    `
  });

  return {
    subject: "Theta-Space Non-E",
    text,
    html
  };
}

export async function sendInviteOrientationEmail(recipientEmail: string) {
  await assertOptionalSystemEmailAllowed(recipientEmail);
  const mailboxes = readPlatformMailboxes();
  await sendPlatformMail({
    to: recipientEmail,
    from: mailboxes.invite,
    replyTo: mailboxes.inviteReplyTo,
    ...buildInviteOrientationEmail(recipientEmail)
  });
}
