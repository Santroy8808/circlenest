import nodemailer, { type Transporter } from "nodemailer";
import { readPlatformEnv } from "@/lib/platform/env";

export type SendSmtpMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
  messageId?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
};

let smtpTransporter: Transporter | null = null;

function requireSmtpEnv() {
  const env = readPlatformEnv();

  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
    throw new Error("SMTP is not configured.");
  }

  return env;
}

export async function sendSmtpMail(input: SendSmtpMailInput) {
  const env = requireSmtpEnv();
  const transporter = smtpTransporter ?? nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    ignoreTLS: false,
    requireTLS: env.SMTP_SECURE !== "true",
    tls: {
      servername: env.SMTP_HOST,
      minVersion: "TLSv1.2"
    },
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });
  smtpTransporter = transporter;

  return transporter.sendMail({
    from: input.from ?? env.SMTP_FROM,
    replyTo: input.replyTo,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    messageId: input.messageId,
    attachments: input.attachments
  });
}
