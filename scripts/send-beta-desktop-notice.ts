import "./load-next-env";
import { sendPlatformMail } from "@/lib/platform/mail";
import { readPlatformMailboxes } from "@/lib/platform/mailboxes";
import { escapeHtml, platformEmailButton, platformWebsiteUrl, renderPlatformEmail } from "@/lib/platform/email-theme";

const recipients = [
  "joanna@codybuilderssupply.com",
  "jeandprod@gmail.com",
  "suziecz@protonmail.com",
  "Sayhellotosallyk@gmail.com",
  "julianne.dearmon@gmail.com",
  "ls556996@gmail.com",
  "gammaworld1@gmail.com",
  "yamiray13@gmail.com",
  "mike@santroy.com"
];

const websiteUrl = platformWebsiteUrl("/");
const subject = "Theta-Space beta testing is best on desktop for now";

function buildText() {
  return [
    "Theta-Space beta testing note",
    "",
    "Thank you for helping test Theta-Space.",
    "",
    "For now, beta testing is really meant for desktop use. You can still open the site from a mobile browser, but the smoothest and most complete experience is currently on a desktop or laptop.",
    "",
    "An Android app is being built now, with an iPhone app planned to follow soon after.",
    "",
    `Website: ${websiteUrl}`,
    "",
    "Thank you for being part of the beta.",
    "",
    "The Theta-Space team"
  ].join("\n");
}

function buildHtml() {
  const safeWebsiteUrl = escapeHtml(websiteUrl);

  return renderPlatformEmail({
    title: "Beta testing works best on desktop for now.",
    eyebrow: "Beta testing note",
    preheader: "Theta-Space beta testing is currently meant for desktop use. Mobile apps are in progress.",
    bodyHtml: `
      <p style="margin:20px 0 18px;color:#c5cfdd;font-size:16px;line-height:1.7;">Thank you for helping test Theta-Space.</p>
      <p style="margin:0 0 18px;color:#c5cfdd;font-size:16px;line-height:1.7;">For now, beta testing is really meant for desktop use. You can still open the site from a mobile browser, but the smoothest and most complete experience is currently on a desktop or laptop.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 24px;background-color:#172133;border:1px solid #334159;border-radius:12px;">
        <tr>
          <td style="padding:18px 20px;color:#dbe2ee;font-size:15px;line-height:1.7;">
            <strong style="color:#ffd85f;">Mobile apps are in progress.</strong><br>
            An Android app is being built now, with an iPhone app planned to follow soon after.
          </td>
        </tr>
      </table>
      ${platformEmailButton("Open Theta-Space", websiteUrl)}
      <p style="margin:0;color:#7f8da3;font-size:12px;line-height:1.65;">Button not working? Copy and paste this address into your browser:<br><a href="${safeWebsiteUrl}" style="color:#6d91ff;text-decoration:underline;word-break:break-all;">${safeWebsiteUrl}</a></p>
    `,
    footerHtml: "Sent by the Theta-Space team."
  });
}

async function main() {
  if (!process.argv.includes("--confirm-send")) {
    throw new Error("Refusing to send without --confirm-send.");
  }

  const mailboxes = readPlatformMailboxes();
  const text = buildText();
  const html = buildHtml();

  for (const recipient of recipients) {
    await sendPlatformMail({
      to: recipient,
      from: mailboxes.invite,
      replyTo: mailboxes.inviteReplyTo,
      subject,
      text,
      html
    });
    console.log(`sent ${recipient}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
