import {
  BillingInvoiceStatus,
  BillingJournalEntryType,
  Prisma,
  type BillingInvoice
} from "@prisma/client";
import type Stripe from "stripe";
import { platformEmailButton, platformWebsiteUrl, renderPlatformEmail } from "@/lib/platform/email-theme";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { sendPlatformMail } from "@/lib/platform/mail";
import { readPlatformMailboxes } from "@/lib/platform/mailboxes";

const MODULE_KEY = "subscription-invoices";

function invoiceStatus(status: Stripe.Invoice.Status | null): BillingInvoiceStatus {
  if (status === "open") return BillingInvoiceStatus.OPEN;
  if (status === "paid") return BillingInvoiceStatus.PAID;
  if (status === "void") return BillingInvoiceStatus.VOID;
  if (status === "uncollectible") return BillingInvoiceStatus.UNCOLLECTIBLE;
  return BillingInvoiceStatus.DRAFT;
}

function timestamp(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000) : null;
}

function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  return stripeId(invoice.parent?.subscription_details?.subscription);
}

async function resolveInvoiceUserId(invoice: Stripe.Invoice, stripeCustomerId: string, stripeSubscriptionId: string | null) {
  const metadataUserId = invoice.parent?.subscription_details?.metadata?.userId;
  if (metadataUserId) {
    const user = await prisma.user.findUnique({ where: { id: metadataUserId }, select: { id: true } });
    if (user) return user.id;
  }

  const membership = await prisma.membership.findFirst({
    where: {
      OR: [
        { stripeCustomerId },
        ...(stripeSubscriptionId ? [{ stripeSubscriptionId }] : [])
      ]
    },
    select: { userId: true }
  });
  return membership?.userId ?? null;
}

function invoiceData(invoice: Stripe.Invoice, userId: string | null, stripeCustomerId: string, stripeSubscriptionId: string | null) {
  return {
    stripeCustomerId,
    stripeSubscriptionId,
    userId,
    invoiceNumber: invoice.number,
    status: invoiceStatus(invoice.status),
    currency: invoice.currency.toUpperCase(),
    subtotalCents: invoice.subtotal,
    totalCents: invoice.total,
    amountDueCents: invoice.amount_due,
    amountPaidCents: invoice.amount_paid,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdfUrl: invoice.invoice_pdf ?? null,
    customerEmail: invoice.customer_email,
    periodStart: timestamp(invoice.period_start),
    periodEnd: timestamp(invoice.period_end),
    paidAt: timestamp(invoice.status_transitions.paid_at),
    stripeCreatedAt: new Date(invoice.created * 1000),
    livemode: invoice.livemode
  };
}

async function recordInvoiceJournals(
  transaction: Prisma.TransactionClient,
  invoice: BillingInvoice,
  stripeEventId: string
) {
  if (invoice.status !== BillingInvoiceStatus.DRAFT && invoice.totalCents > 0) {
    await transaction.billingJournalEntry.upsert({
      where: { operationId: `stripe-invoice:${invoice.stripeInvoiceId}:issued:${invoice.totalCents}` },
      update: {},
      create: {
        operationId: `stripe-invoice:${invoice.stripeInvoiceId}:issued:${invoice.totalCents}`,
        invoiceId: invoice.id,
        userId: invoice.userId,
        entryType: BillingJournalEntryType.INVOICE_ISSUED,
        debitAccount: "ACCOUNTS_RECEIVABLE",
        creditAccount: "SUBSCRIPTION_REVENUE",
        amountCents: invoice.totalCents,
        currency: invoice.currency,
        occurredAt: invoice.stripeCreatedAt,
        livemode: invoice.livemode,
        metadata: { stripeEventId }
      }
    });
  }

  if (invoice.status === BillingInvoiceStatus.PAID && invoice.amountPaidCents > 0) {
    await transaction.billingJournalEntry.upsert({
      where: { operationId: `stripe-invoice:${invoice.stripeInvoiceId}:paid:${invoice.amountPaidCents}` },
      update: {},
      create: {
        operationId: `stripe-invoice:${invoice.stripeInvoiceId}:paid:${invoice.amountPaidCents}`,
        invoiceId: invoice.id,
        userId: invoice.userId,
        entryType: BillingJournalEntryType.PAYMENT_RECEIVED,
        debitAccount: "STRIPE_CLEARING",
        creditAccount: "ACCOUNTS_RECEIVABLE",
        amountCents: invoice.amountPaidCents,
        currency: invoice.currency,
        occurredAt: invoice.paidAt ?? invoice.updatedAt,
        livemode: invoice.livemode,
        metadata: { stripeEventId }
      }
    });
  }
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function buildSubscriptionInvoiceEmail(invoice: BillingInvoice) {
  const amount = money(invoice.amountPaidCents, invoice.currency);
  const invoiceLabel = invoice.invoiceNumber ?? invoice.stripeInvoiceId;
  const billingUrl = platformWebsiteUrl("/settings/subscription");
  const viewUrl = invoice.hostedInvoiceUrl ?? invoice.invoicePdfUrl ?? billingUrl;
  const testNotice = invoice.livemode
    ? ""
    : "This is a Stripe test-mode invoice. No real money was charged.";
  return {
    subject: `${invoice.livemode ? "" : "TEST - "}Theta-Space payment receipt ${invoiceLabel}`,
    text: [
      "THETA-SPACE PAYMENT RECEIPT",
      "===========================",
      "",
      testNotice,
      `Invoice: ${invoiceLabel}`,
      `Amount paid: ${amount}`,
      `Status: ${invoice.status}`,
      `View invoice: ${viewUrl}`,
      "",
      `Manage membership: ${billingUrl}`
    ].filter(Boolean).join("\n"),
    html: renderPlatformEmail({
      eyebrow: invoice.livemode ? "Payment receipt" : "Test payment receipt",
      title: `Payment received: ${amount}`,
      preheader: `Theta-Space invoice ${invoiceLabel} has been paid.`,
      bodyHtml: `
        ${testNotice ? `<p style="margin:0 0 20px;color:#ffd85f;font-size:15px;line-height:1.7;"><strong>${testNotice}</strong></p>` : ""}
        <p style="margin:0 0 18px;color:#c5cfdd;font-size:16px;line-height:1.7;">Your Theta-Space Contributor subscription payment was received.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 24px;background-color:#172133;border:1px solid #334159;border-radius:8px;">
          <tr><td style="padding:18px 20px;color:#dbe2ee;font-size:15px;line-height:1.8;"><strong style="color:#ffd85f;">Invoice</strong> ${invoiceLabel}<br><strong style="color:#ffd85f;">Amount paid</strong> ${amount}<br><strong style="color:#ffd85f;">Status</strong> Paid</td></tr>
        </table>
        ${platformEmailButton("View invoice", viewUrl)}
        <p style="margin:22px 0 0;color:#aab4c3;font-size:13px;line-height:1.65;">You can manage your membership and payment details from Theta-Space Settings.</p>
      `
    })
  };
}

async function sendInvoiceReceiptIfNeeded(invoice: BillingInvoice) {
  if (invoice.status !== BillingInvoiceStatus.PAID || invoice.receiptEmailSentAt) return;
  const recipient = invoice.customerEmail ?? (
    invoice.userId
      ? (await prisma.user.findUnique({ where: { id: invoice.userId }, select: { email: true } }))?.email
      : null
  );
  if (!recipient) return;

  const claimed = await prisma.billingInvoice.updateMany({
    where: {
      id: invoice.id,
      receiptEmailSentAt: null,
      OR: [{ receiptEmailError: null }, { receiptEmailError: { not: "SENDING" } }]
    },
    data: { receiptEmailError: "SENDING" }
  });
  if (claimed.count !== 1) return;

  try {
    const mailboxes = readPlatformMailboxes();
    await sendPlatformMail({
      to: recipient,
      from: mailboxes.system,
      replyTo: mailboxes.support,
      ...buildSubscriptionInvoiceEmail(invoice)
    });
    await prisma.billingInvoice.update({
      where: { id: invoice.id },
      data: { receiptEmailSentAt: new Date(), receiptEmailError: null }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send invoice receipt.";
    await prisma.billingInvoice.update({
      where: { id: invoice.id },
      data: { receiptEmailError: message.slice(0, 1000) }
    });
    await diagnostics.error(MODULE_KEY, "Invoice was recorded but its receipt email failed.", {
      invoiceId: invoice.id,
      stripeInvoiceId: invoice.stripeInvoiceId,
      error: message
    });
  }
}

export async function syncStripeSubscriptionInvoice(invoice: Stripe.Invoice, stripeEventId: string) {
  const stripeCustomerId = stripeId(invoice.customer);
  if (!stripeCustomerId) return { ignored: true as const };
  const stripeSubscriptionId = invoiceSubscriptionId(invoice);
  const userId = await resolveInvoiceUserId(invoice, stripeCustomerId, stripeSubscriptionId);
  const saved = await prisma.$transaction(async (transaction) => {
    const record = await transaction.billingInvoice.upsert({
      where: { stripeInvoiceId: invoice.id },
      update: invoiceData(invoice, userId, stripeCustomerId, stripeSubscriptionId),
      create: {
        stripeInvoiceId: invoice.id,
        ...invoiceData(invoice, userId, stripeCustomerId, stripeSubscriptionId)
      }
    });
    await recordInvoiceJournals(transaction, record, stripeEventId);
    return record;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await sendInvoiceReceiptIfNeeded(saved);
  return { ignored: false as const, invoice: saved };
}

export async function listMemberBillingInvoices(userId: string) {
  return prisma.billingInvoice.findMany({
    where: { userId },
    orderBy: { stripeCreatedAt: "desc" },
    take: 36
  });
}

export async function getAccountingReport(livemode: boolean) {
  const [invoices, journalEntries, totals] = await Promise.all([
    prisma.billingInvoice.findMany({
      where: { livemode },
      orderBy: { stripeCreatedAt: "desc" },
      take: 250,
      include: { user: { select: { email: true, username: true } } }
    }),
    prisma.billingJournalEntry.findMany({
      where: { livemode },
      orderBy: { occurredAt: "desc" },
      take: 500,
      include: { invoice: { select: { stripeInvoiceId: true, invoiceNumber: true } } }
    }),
    prisma.billingInvoice.aggregate({
      where: { livemode },
      _sum: { totalCents: true, amountPaidCents: true, amountDueCents: true },
      _count: { _all: true }
    })
  ]);
  return { invoices, journalEntries, totals };
}
