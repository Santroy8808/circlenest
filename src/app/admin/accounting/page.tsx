import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { getAdminPortalView } from "@/modules/admin-moderation/admin-moderation.service";
import { getAccountingReport } from "@/modules/billing/subscription-invoices.service";

export const dynamic = "force-dynamic";

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default async function AccountingReportPage(props: { searchParams?: Promise<{ mode?: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.revoked) redirect("/login?callbackUrl=/admin/accounting");
  const access = await getAdminPortalView(session.user.id);
  if (!access.canAccess) redirect("/");

  const searchParams = await props.searchParams;
  const livemode = searchParams?.mode === "live";
  const report = await getAccountingReport(livemode);
  const currency = report.invoices[0]?.currency ?? "USD";

  return (
    <AppShell>
      <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-6">
        <header className="border-b border-[var(--line)] pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">Billing and payments</p>
          <h1 className="mt-2 text-3xl font-semibold">Accounting report</h1>
          <p className="mt-2 text-[var(--muted)]">Stripe subscription invoices and balanced accounting journal entries.</p>
          <nav className="mt-4 flex gap-2" aria-label="Accounting mode">
            <a className={!livemode ? "btn-primary" : "btn-secondary"} href="/admin/accounting?mode=test">Test data</a>
            <a className={livemode ? "btn-primary" : "btn-secondary"} href="/admin/accounting?mode=live">Live data</a>
          </nav>
        </header>

        {!livemode ? (
          <p className="rounded-md border border-[var(--gold)] bg-[var(--gold)]/5 p-4 font-semibold text-[var(--gold)]">Test mode: these records do not represent real charges.</p>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3" aria-label="Accounting totals">
          <div className="rounded-md border border-[var(--line)] p-4"><p className="text-xs uppercase text-[var(--muted)]">Invoices</p><p className="mt-2 text-2xl font-semibold">{report.totals._count._all}</p></div>
          <div className="rounded-md border border-[var(--line)] p-4"><p className="text-xs uppercase text-[var(--muted)]">Invoiced</p><p className="mt-2 text-2xl font-semibold">{money(report.totals._sum.totalCents ?? 0, currency)}</p></div>
          <div className="rounded-md border border-[var(--line)] p-4"><p className="text-xs uppercase text-[var(--muted)]">Paid</p><p className="mt-2 text-2xl font-semibold">{money(report.totals._sum.amountPaidCents ?? 0, currency)}</p></div>
        </section>

        <section className="rounded-md border border-[var(--line)] p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Invoices</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--gold)]"><tr><th className="p-3">Date</th><th className="p-3">Member</th><th className="p-3">Invoice</th><th className="p-3">Status</th><th className="p-3">Total</th><th className="p-3">Paid</th><th className="p-3">Receipt email</th></tr></thead>
              <tbody>
                {report.invoices.map((invoice) => (
                  <tr className="border-t border-[var(--line)]" key={invoice.id}>
                    <td className="p-3">{invoice.stripeCreatedAt.toLocaleDateString()}</td>
                    <td className="p-3">{invoice.user?.email ?? invoice.customerEmail ?? "Unmatched"}</td>
                    <td className="p-3">{invoice.invoiceNumber ?? invoice.stripeInvoiceId}</td>
                    <td className="p-3">{invoice.status}</td>
                    <td className="p-3">{money(invoice.totalCents, invoice.currency)}</td>
                    <td className="p-3">{money(invoice.amountPaidCents, invoice.currency)}</td>
                    <td className="p-3">{invoice.receiptEmailSentAt ? "Sent" : invoice.receiptEmailError ? `Error: ${invoice.receiptEmailError}` : "Pending"}</td>
                  </tr>
                ))}
                {report.invoices.length === 0 ? <tr><td className="p-4 text-[var(--muted)]" colSpan={7}>No invoices in this mode yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-md border border-[var(--line)] p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Accounting journal</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--gold)]"><tr><th className="p-3">Date</th><th className="p-3">Type</th><th className="p-3">Debit</th><th className="p-3">Credit</th><th className="p-3">Amount</th><th className="p-3">Invoice</th></tr></thead>
              <tbody>
                {report.journalEntries.map((entry) => (
                  <tr className="border-t border-[var(--line)]" key={entry.id}>
                    <td className="p-3">{entry.occurredAt.toLocaleDateString()}</td>
                    <td className="p-3">{entry.entryType}</td>
                    <td className="p-3">{entry.debitAccount}</td>
                    <td className="p-3">{entry.creditAccount}</td>
                    <td className="p-3">{money(entry.amountCents, entry.currency)}</td>
                    <td className="p-3">{entry.invoice.invoiceNumber ?? entry.invoice.stripeInvoiceId}</td>
                  </tr>
                ))}
                {report.journalEntries.length === 0 ? <tr><td className="p-4 text-[var(--muted)]" colSpan={6}>No journal entries in this mode yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
