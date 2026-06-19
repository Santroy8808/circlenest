import nodemailer from "nodemailer";
import { readPlatformEnv } from "@/lib/platform/env";

type SendSmtpMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function requireSmtpEnv() {
  const env = readPlatformEnv();

  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
    throw new Error("SMTP is not configured.");
  }

  return env;
}

export async function sendSmtpMail(input: SendSmtpMailInput) {
  const env = requireSmtpEnv();
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    ignoreTLS: env.SMTP_IGNORE_TLS === "true",
    requireTLS: env.SMTP_SECURE !== "true",
    tls: {
      servername: env.SMTP_HOST
    },
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });

  return transporter.sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html
  });
}
