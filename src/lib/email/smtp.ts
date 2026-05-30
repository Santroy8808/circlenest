import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";

export function createSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "465");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = port === 465;
  const family = Number(process.env.SMTP_IP_FAMILY ?? "4");

  if (!host || !user || !pass) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.");
  }

  type SmtpOptions = SMTPTransport.Options & { family?: 4 | 6 };
  const options: SmtpOptions = {
    host,
    port,
    secure,
    auth: { user, pass },
    // Some SMTP providers don't support IPv6; Railway can prefer AAAA lookups.
    // Force IPv4 by default to avoid connection timeouts.
    family: family === 6 ? 6 : 4,
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS ?? "15000"),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS ?? "15000"),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS ?? "30000"),
  };

  return nodemailer.createTransport(options);
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@theta-space.local";
  const transporter = createSmtpTransport();

  // Helpful during deployment/debugging: verifies connectivity/auth before sendMail.
  // This call is cheap and surfaces TLS/auth problems clearly in logs.
  await transporter.verify();

  await transporter.sendMail({
    from,
    to,
    subject: "Theta-Space password reset",
    text: `Reset your password using this link: ${resetUrl}`,
    html: `<p>Reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
  });
}

export async function sendEmailVerificationEmail(to: string, verifyUrl: string) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@theta-space.local";
  const transporter = createSmtpTransport();

  await transporter.verify();

  await transporter.sendMail({
    from,
    to,
    subject: "Theta-Space email verification",
    text: `Please validate your email by clicking Validate in the email we sent you: ${verifyUrl}`,
    html: `<p>Please validate your email by clicking Validate in the email we sent you.</p><p><a href="${verifyUrl}">Validate</a></p>`,
  });
}
