import { createHash, randomUUID, sign, X509Certificate } from "crypto";
import { readFile } from "fs/promises";
import { readPlatformEnv } from "@/lib/platform/env";
import { sendSmtpMail } from "@/lib/platform/smtp";

export type SendPlatformMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
};

type GraphTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

let graphTokenCache: { accessToken: string; expiresAt: number } | null = null;

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

async function getMicrosoftGraphToken() {
  const now = Math.floor(Date.now() / 1000);
  if (graphTokenCache && graphTokenCache.expiresAt - 300 > now) {
    return graphTokenCache.accessToken;
  }

  const env = readPlatformEnv();
  const tenantId = env.MICROSOFT_GRAPH_TENANT_ID;
  const clientId = env.MICROSOFT_GRAPH_CLIENT_ID;
  const certificatePath = env.MICROSOFT_GRAPH_CERTIFICATE_PATH;
  const privateKeyPath = env.MICROSOFT_GRAPH_PRIVATE_KEY_PATH;
  if (!tenantId || !clientId || !certificatePath || !privateKeyPath) {
    throw new Error("Microsoft Graph mail authentication is not configured.");
  }

  const [certificatePem, privateKeyPem] = await Promise.all([
    readFile(certificatePath, "utf8"),
    readFile(privateKeyPath, "utf8")
  ]);
  const certificate = new X509Certificate(certificatePem);
  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const header = base64Url(JSON.stringify({
    alg: "RS256",
    typ: "JWT",
    x5t: createHash("sha1").update(certificate.raw).digest("base64url")
  }));
  const payload = base64Url(JSON.stringify({
    aud: tokenEndpoint,
    iss: clientId,
    sub: clientId,
    jti: randomUUID(),
    nbf: now,
    exp: now + 300
  }));
  const unsignedAssertion = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(unsignedAssertion), privateKeyPem).toString("base64url");

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: `${unsignedAssertion}.${signature}`
    })
  });
  const result = await response.json() as GraphTokenResponse;
  if (!response.ok || !result.access_token) {
    throw new Error(`Microsoft Graph authentication failed with status ${response.status}.`);
  }

  graphTokenCache = {
    accessToken: result.access_token,
    expiresAt: now + Math.max(300, result.expires_in ?? 3600)
  };
  return result.access_token;
}

async function sendMicrosoftGraphMail(input: SendPlatformMailInput) {
  const env = readPlatformEnv();
  const sender = input.from ?? env.MICROSOFT_GRAPH_SENDER;
  if (!sender) throw new Error("Microsoft Graph mail sender is not configured.");

  const accessToken = await getMicrosoftGraphToken();
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: {
            contentType: input.html ? "HTML" : "Text",
            content: input.html ?? input.text
          },
          toRecipients: [{ emailAddress: { address: input.to } }],
          ...(input.replyTo
            ? { replyTo: [{ emailAddress: { address: input.replyTo } }] }
            : {}),
          ...(input.attachments?.length
            ? {
                attachments: input.attachments.map((attachment) => ({
                  "@odata.type": "#microsoft.graph.fileAttachment",
                  name: attachment.filename,
                  contentType: attachment.contentType ?? "application/octet-stream",
                  contentBytes: attachment.content.toString("base64")
                }))
              }
            : {})
        },
        saveToSentItems: true
      })
    }
  );

  if (response.status !== 202) {
    throw new Error(`Microsoft Graph mail delivery failed with status ${response.status}.`);
  }
  return { accepted: [input.to], response: "202 Accepted", messageId: null };
}

export async function sendPlatformMail(input: SendPlatformMailInput) {
  const env = readPlatformEnv();
  if (env.MAIL_TRANSPORT === "microsoft-graph") {
    return sendMicrosoftGraphMail(input);
  }
  return sendSmtpMail(input);
}
