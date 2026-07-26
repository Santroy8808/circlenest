import { readPlatformEnv } from "@/lib/platform/env";

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function publicOrigin() {
  const env = readPlatformEnv();
  return new URL(env.APP_ORIGIN || env.NEXTAUTH_URL || "https://theta-space.net").origin;
}

export function platformWebsiteUrl(path = "/") {
  return `${publicOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function platformEmailButton(label: string, href: string) {
  const safeLabel = escapeHtml(label);
  const safeHref = escapeHtml(href);

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 28px;">
    <tr>
      <td align="center" bgcolor="#ffd85f" style="border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.24);">
        <a href="${safeHref}" style="display:inline-block;padding:14px 28px;border:1px solid #ffd85f;border-radius:999px;color:#080b10;font-size:16px;font-weight:800;line-height:1;text-decoration:none;">${safeLabel}</a>
      </td>
    </tr>
  </table>`;
}

export function renderPlatformEmail(input: {
  bodyHtml: string;
  eyebrow?: string;
  footerHtml?: string;
  preheader: string;
  title: string;
}) {
  const origin = publicOrigin();
  const logoUrl = `${origin}/assets/theta-send-logo.png`;
  const safePreheader = escapeHtml(input.preheader);
  const safeTitle = escapeHtml(input.title);
  const safeEyebrow = input.eyebrow ? escapeHtml(input.eyebrow) : null;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="supported-color-schemes" content="dark">
    <title>${safeTitle}</title>
    <style>
      @media only screen and (max-width: 640px) {
        .theta-shell { padding: 18px 10px !important; }
        .theta-card-cell { padding-left: 22px !important; padding-right: 22px !important; }
        .theta-title { font-size: 30px !important; }
        .theta-logo { width: 58px !important; height: auto !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#080b10;color:#dbe2ee;font-family:Inter,'Segoe UI',Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#080b10;">
      <tr>
        <td align="center" class="theta-shell" style="padding:38px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:620px;background-color:#111824;border:1px solid #334159;border-radius:18px;overflow:hidden;">
            <tr>
              <td class="theta-card-cell" style="padding:28px 34px;background-color:#0d131d;border-bottom:1px solid #334159;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="72" valign="middle">
                      <img class="theta-logo" alt="Theta-Space" src="${escapeHtml(logoUrl)}" width="64" style="display:block;width:64px;height:auto;border:0;outline:none;text-decoration:none;">
                    </td>
                    <td valign="middle" style="padding-left:12px;">
                      <div style="color:#ffd85f;font-size:14px;font-weight:800;letter-spacing:3px;line-height:1.2;">THETA-SPACE</div>
                      <div style="margin-top:5px;color:#aab4c3;font-size:12px;letter-spacing:1px;">PRIVATE MEMBER COMMUNITY</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="theta-card-cell" style="padding:38px 34px 34px;">
                ${safeEyebrow ? `<div style="margin:0 0 12px;color:#6d91ff;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">${safeEyebrow}</div>` : ""}
                <h1 class="theta-title" style="margin:0;color:#f4f7fc;font-size:36px;line-height:1.15;font-weight:750;">${safeTitle}</h1>
                ${input.bodyHtml}
              </td>
            </tr>
            <tr>
              <td class="theta-card-cell" style="padding:20px 34px;background-color:#0d131d;border-top:1px solid #334159;color:#7f8da3;font-size:12px;line-height:1.6;">
                ${input.footerHtml ?? "Sent by the Theta-Space team."}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
