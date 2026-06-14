import { randomUUID } from "crypto";
import { hash } from "bcryptjs";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "../src/lib/db/prisma";
import {
  appendMockBillingLedger,
  buildMockBillingCustomerId,
  buildMockBillingSubscriptionId,
  ensureMockBillingOutputDirs,
  MOCK_BILLING_LEDGER_PATH,
  MOCK_BILLING_OUTPUT_DIR,
  MOCK_BILLING_REPORT_DIR,
  resolveMockBillingMonthKey,
  resolveMockBillingPeriodEnd,
  resolveMockBillingPriceCents,
} from "../src/lib/billing/mock";
import type { BillingPlanTier } from "../src/lib/billing/stripe";

type SimUser = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  tier: BillingPlanTier | "FREE";
  createdAt: Date;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  billingActive: boolean;
  lastChargeMonthIndex: number | null;
};

type MonthReport = {
  monthKey: string;
  freeUsers: number;
  plusUsers: number;
  proUsers: number;
  newSignups: number;
  plusRenewals: number;
  proRenewals: number;
  plusUpgrades: number;
  proUpgrades: number;
  cancellations: number;
  revenueCents: number;
  totalLedgerEntries: number;
  notes: string[];
};

const runId = process.env.MOCK_BILLING_RUN_ID?.trim() || "2026-01-to-2026-06";
const today = new Date();
const startMonth = new Date(today.getFullYear(), today.getMonth() - 5, 1);
const monthCount = 6;
let defaultPasswordHash = "";

const namePairs = [
  ["Atlas", "Fox"],
  ["Nova", "Lane"],
  ["Milo", "Grant"],
  ["Juno", "Hart"],
  ["Iris", "Stone"],
  ["Baxter", "Reed"],
  ["Piper", "Vale"],
  ["Orion", "Cruz"],
  ["Sage", "Brooks"],
  ["Zuri", "Cole"],
  ["Cedar", "Blake"],
  ["Indigo", "Wren"],
  ["Mira", "Pace"],
  ["Finn", "North"],
  ["Echo", "Bloom"],
  ["Rory", "Quill"],
  ["Skye", "Page"],
  ["Dex", "Mercer"],
  ["Luna", "Parks"],
  ["Tate", "Sloan"],
  ["Aria", "Moss"],
  ["Rowan", "Lake"],
  ["Vega", "Stone"],
  ["Beau", "Knight"],
  ["Nia", "West"],
  ["Jett", "Vale"],
  ["Cora", "Field"],
  ["Ezra", "Bishop"],
  ["Wren", "Frost"],
  ["Leo", "Kane"],
] as const;

function monthStart(index: number) {
  return new Date(startMonth.getFullYear(), startMonth.getMonth() + index, 1);
}

function monthLabel(date: Date) {
  return date.toISOString().slice(0, 7);
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

async function clearOutputs() {
  await ensureMockBillingOutputDirs();
  await writeFile(MOCK_BILLING_LEDGER_PATH, "", "utf8");
  for (let i = 0; i < monthCount; i++) {
    const file = path.join(MOCK_BILLING_REPORT_DIR, `${monthLabel(monthStart(i))}.md`);
    await rm(file, { force: true }).catch(() => undefined);
  }
  await rm(path.join(MOCK_BILLING_OUTPUT_DIR, "README.md"), { force: true }).catch(() => undefined);
}

async function ensureUser(index: number, tier: SimUser["tier"], createdAt: Date) {
  const [first, last] = namePairs[index % namePairs.length];
  const username = `mockbill-${slug(first)}-${slug(last)}-${runId}-${String(index + 1).padStart(2, "0")}`;
  const email = `${username}@theta-space.dev`;
  const fullName = `${first} ${last}`;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, username: true, email: true, fullName: true, subscriptionTier: true, createdAt: true, billingSubscription: true },
  });
  if (existing) {
    return {
      id: existing.id,
      username: existing.username,
      email: existing.email,
      fullName: existing.fullName ?? fullName,
      tier: (existing.subscriptionTier?.toUpperCase() as SimUser["tier"]) || "FREE",
      createdAt: existing.createdAt,
      providerCustomerId: existing.billingSubscription?.providerCustomerId ?? null,
      providerSubscriptionId: existing.billingSubscription?.providerSubscriptionId ?? null,
      billingActive: existing.subscriptionTier?.toUpperCase() !== "FREE" && existing.billingSubscription?.status !== "CANCELED",
      lastChargeMonthIndex: null,
    } satisfies SimUser;
  }

  const user = await prisma.user.create({
    data: {
      fullName,
      email,
      username,
      passwordHash: defaultPasswordHash,
      subscriptionTier: tier,
      createdAt,
      profile: {
        create: {
          displayName: fullName,
          bio: `Mock billing user for ${runId}.`,
        },
      },
    },
    select: { id: true, username: true, email: true, fullName: true, createdAt: true },
  });

  return {
    ...user,
    fullName: user.fullName ?? fullName,
    tier,
    providerCustomerId: null,
    providerSubscriptionId: null,
    billingActive: tier !== "FREE",
    lastChargeMonthIndex: null,
  } satisfies SimUser;
}

async function upsertSubscription(user: SimUser, tier: BillingPlanTier, status: string, startedAt: Date, chargeMonthIndex: number) {
  const providerCustomerId = user.providerCustomerId ?? buildMockBillingCustomerId(user.id);
  const providerSubscriptionId = buildMockBillingSubscriptionId(user.id, tier);
  const currentPeriodEnd = resolveMockBillingPeriodEnd(startedAt);
  await prisma.billingSubscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      provider: "MOCK",
      providerCustomerId,
      providerSubscriptionId,
      subscriptionTier: tier,
      status,
      currentPeriodStart: startedAt,
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      trialEndsAt: null,
      pausedAt: null,
    },
    update: {
      provider: "MOCK",
      providerCustomerId,
      providerSubscriptionId,
      subscriptionTier: tier,
      status,
      currentPeriodStart: startedAt,
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      trialEndsAt: null,
      pausedAt: null,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { subscriptionTier: tier },
  });

  user.tier = tier;
  user.providerCustomerId = providerCustomerId;
  user.providerSubscriptionId = providerSubscriptionId;
  user.billingActive = true;
  user.lastChargeMonthIndex = chargeMonthIndex;
}

async function logSignup(user: SimUser, occurredAt: Date) {
  await appendMockBillingLedger({
    id: crypto.randomUUID(),
    occurredAt: occurredAt.toISOString(),
    eventType: "signup.created",
    userId: user.id,
    username: user.username,
    email: user.email,
    tier: "FREE",
    amountCents: 0,
    providerCustomerId: buildMockBillingCustomerId(user.id),
    providerSubscriptionId: buildMockBillingSubscriptionId(user.id, "CONTRIBUTOR"),
    status: "FREE",
    monthKey: resolveMockBillingMonthKey(occurredAt),
    note: `Mock signup created for ${user.fullName}.`,
  });
}

async function logBillingEvent(
  eventType: "checkout.completed" | "subscription.renewed" | "subscription.updated" | "subscription.canceled" | "invoice.paid" | "invoice.failed",
  user: SimUser,
  tier: BillingPlanTier,
  amountCents: number,
  occurredAt: Date,
  status: string,
  note: string,
) {
  await appendMockBillingLedger({
    id: crypto.randomUUID(),
    occurredAt: occurredAt.toISOString(),
    eventType,
    userId: user.id,
    username: user.username,
    email: user.email,
    tier,
    amountCents,
    providerCustomerId: user.providerCustomerId ?? buildMockBillingCustomerId(user.id),
    providerSubscriptionId: user.providerSubscriptionId ?? buildMockBillingSubscriptionId(user.id, tier),
    status,
    monthKey: resolveMockBillingMonthKey(occurredAt),
    note,
  });
}

function makeReportMarkdown(report: MonthReport) {
  return `# Mock billing report - ${report.monthKey}

| Metric | Value |
| --- | ---: |
| Free users | ${report.freeUsers} |
| Contributor users | ${report.plusUsers} |
| Pro users | ${report.proUsers} |
| New signups | ${report.newSignups} |
| Contributor renewals | ${report.plusRenewals} |
| Pro renewals | ${report.proRenewals} |
| Contributor upgrades | ${report.plusUpgrades} |
| Pro upgrades | ${report.proUpgrades} |
| Cancellations | ${report.cancellations} |
| Revenue | ${formatDollars(report.revenueCents)} |
| Ledger entries | ${report.totalLedgerEntries} |

## Notes
${report.notes.map((note) => `- ${note}`).join("\n")}
`;
}

async function writeReport(report: MonthReport) {
  const file = path.join(MOCK_BILLING_REPORT_DIR, `${report.monthKey}.md`);
  await writeFile(file, makeReportMarkdown(report), "utf8");
}

async function writeIndex(reports: MonthReport[]) {
  const lines = [
    "# Mock Billing Simulation",
    "",
    `Run ID: ${runId}`,
    "",
    "Ad testing skipped: no live ad auction/payment tracking is configured yet.",
    "",
    "## Reports",
    ...reports.map((report) => `- [${report.monthKey}](./reports/${report.monthKey}.md) - ${formatDollars(report.revenueCents)} revenue`),
    "",
    "## Ledger",
    `- [Mock billing log](./mock-billing-log.jsonl)`,
  ];
  await writeFile(path.join(MOCK_BILLING_OUTPUT_DIR, "README.md"), `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  defaultPasswordHash = await hash("password123", 10);
  await clearOutputs();

  const users: SimUser[] = [];
  const reports: MonthReport[] = [];
  let initialLedgerEntries = 0;

  const initialCohort: Array<SimUser["tier"]> = ["FREE", "FREE", "FREE", "FREE", "FREE", "FREE", "CONTRIBUTOR", "CONTRIBUTOR", "CONTRIBUTOR", "PRO", "PRO", "FREE"];
  for (let i = 0; i < initialCohort.length; i++) {
    const createdAt = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1, 9, 0, 0);
    const user = await ensureUser(i, initialCohort[i], createdAt);
    users.push(user);
    await logSignup(user, createdAt);
    initialLedgerEntries += 1;
    if (user.tier !== "FREE") {
      const paidTier = user.tier as BillingPlanTier;
      await upsertSubscription(user, paidTier, "ACTIVE", createdAt, 0);
      await logBillingEvent("checkout.completed", user, paidTier, resolveMockBillingPriceCents(paidTier), createdAt, "ACTIVE", `Initial ${paidTier} subscription started.`);
      initialLedgerEntries += 1;
    }
  }

  const monthlySignupPlan = [3, 3, 3, 3, 2, 2];
  const upgradePlan: Array<{ freeToPlus: number; freeToPro: number; plusToPro: number; cancellations: number }> = [
    { freeToPlus: 2, freeToPro: 0, plusToPro: 1, cancellations: 0 },
    { freeToPlus: 2, freeToPro: 0, plusToPro: 1, cancellations: 0 },
    { freeToPlus: 1, freeToPro: 1, plusToPro: 1, cancellations: 1 },
    { freeToPlus: 2, freeToPro: 0, plusToPro: 1, cancellations: 1 },
    { freeToPlus: 1, freeToPro: 1, plusToPro: 1, cancellations: 1 },
    { freeToPlus: 1, freeToPro: 0, plusToPro: 1, cancellations: 2 },
  ];

  for (let monthIndex = 0; monthIndex < monthCount; monthIndex++) {
    const month = monthStart(monthIndex);
    const monthKey = monthLabel(month);
    const nextMonthStart = new Date(month.getFullYear(), month.getMonth() + 1, 1, 0, 0, 0);
    const notes: string[] = [];
    let ledgerEntriesThisMonth = 0;
    let newSignups = 0;
    let plusRenewals = 0;
    let proRenewals = 0;
    let plusUpgrades = 0;
    let proUpgrades = 0;
    let cancellations = 0;
    let revenueCents = 0;

    const activePaidBeforeMonth = users.filter(
      (user) => user.billingActive && (user.tier === "CONTRIBUTOR" || user.tier === "PRO") && (user.lastChargeMonthIndex ?? -1) < monthIndex,
    );
    for (const user of activePaidBeforeMonth) {
      const paidTier = user.tier as BillingPlanTier;
      const amountCents = resolveMockBillingPriceCents(paidTier);
      revenueCents += amountCents;
      if (paidTier === "CONTRIBUTOR") plusRenewals += 1;
      if (paidTier === "PRO") proRenewals += 1;
      await upsertSubscription(user, paidTier, "ACTIVE", month, monthIndex);
      await logBillingEvent("subscription.renewed", user, paidTier, amountCents, month, "ACTIVE", `${paidTier} renewal for ${monthKey}.`);
      ledgerEntriesThisMonth += 1;
    }

    const signupCount = monthlySignupPlan[monthIndex] ?? 0;
    for (let i = 0; i < signupCount; i++) {
      const userIndex = users.length + (monthIndex * 10) + i;
      const createdAt = new Date(month.getFullYear(), month.getMonth(), 2 + i, 10, 0, 0);
      const user = await ensureUser(userIndex, "FREE", createdAt);
      users.push(user);
      newSignups += 1;
      await logSignup(user, createdAt);
      ledgerEntriesThisMonth += 1;
    }

    const freeUsers = users.filter((user) => user.tier === "FREE");
    const plusUsers = users.filter((user) => user.tier === "CONTRIBUTOR");

    const monthPlan = upgradePlan[monthIndex];
    const freeUpgradePool = [...freeUsers];

    for (let i = 0; i < monthPlan.freeToPlus && freeUpgradePool.length; i++) {
      const user = freeUpgradePool.shift()!;
      const chargeDate = new Date(month.getFullYear(), month.getMonth(), 12, 12, 0, 0);
      await upsertSubscription(user, "CONTRIBUTOR", "ACTIVE", chargeDate, monthIndex);
      const amountCents = resolveMockBillingPriceCents("CONTRIBUTOR");
      revenueCents += amountCents;
      plusUpgrades += 1;
      notes.push(`@${user.username} upgraded from Free to Contributor.`);
      await logBillingEvent("checkout.completed", user, "CONTRIBUTOR", amountCents, chargeDate, "ACTIVE", "Mock upgrade checkout completed.");
      ledgerEntriesThisMonth += 1;
    }

    for (let i = 0; i < monthPlan.freeToPro && freeUpgradePool.length; i++) {
      const user = freeUpgradePool.shift()!;
      const chargeDate = new Date(month.getFullYear(), month.getMonth(), 13, 12, 0, 0);
      await upsertSubscription(user, "PRO", "ACTIVE", chargeDate, monthIndex);
      const amountCents = resolveMockBillingPriceCents("PRO");
      revenueCents += amountCents;
      proUpgrades += 1;
      notes.push(`@${user.username} upgraded from Free to Pro.`);
      await logBillingEvent("checkout.completed", user, "PRO", amountCents, chargeDate, "ACTIVE", "Mock upgrade checkout completed.");
      ledgerEntriesThisMonth += 1;
    }

    for (let i = 0; i < monthPlan.plusToPro && i < plusUsers.length; i++) {
      const user = plusUsers[i];
      const chargeDate = new Date(month.getFullYear(), month.getMonth(), 14, 12, 0, 0);
      await upsertSubscription(user, "PRO", "ACTIVE", chargeDate, monthIndex);
      const amountCents = resolveMockBillingPriceCents("PRO");
      revenueCents += amountCents;
      proUpgrades += 1;
      notes.push(`@${user.username} upgraded from Contributor to Pro.`);
      await logBillingEvent("subscription.updated", user, "PRO", amountCents, chargeDate, "ACTIVE", "Mock tier change to Pro.");
      ledgerEntriesThisMonth += 1;
    }

    const cancelTargets = users
      .filter((user) => user.billingActive && (user.tier === "CONTRIBUTOR" || user.tier === "PRO"))
      .slice(0, monthPlan.cancellations);
    for (const user of cancelTargets) {
      cancellations += 1;
      await prisma.billingSubscription.updateMany({
        where: { userId: user.id },
        data: {
          status: "CANCELED",
          canceledAt: nextMonthStart,
          cancelAtPeriodEnd: true,
        },
      });
      user.billingActive = false;
      notes.push(`@${user.username} set to cancel at period end.`);
      await logBillingEvent("subscription.canceled", user, user.tier === "FREE" ? "CONTRIBUTOR" : user.tier, 0, nextMonthStart, "CANCELED", "Mock cancellation scheduled.");
      ledgerEntriesThisMonth += 1;
    }

    const freeCount = users.filter((user) => user.tier === "FREE").length;
    const plusCount = users.filter((user) => user.tier === "CONTRIBUTOR").length;
    const proCount = users.filter((user) => user.tier === "PRO").length;

    reports.push({
      monthKey,
      freeUsers: freeCount,
      plusUsers: plusCount,
      proUsers: proCount,
      newSignups,
      plusRenewals,
      proRenewals,
      plusUpgrades,
      proUpgrades,
      cancellations,
      revenueCents,
      totalLedgerEntries: ledgerEntriesThisMonth + (monthIndex === 0 ? initialLedgerEntries : 0),
      notes: notes.length ? notes : ["No paid-plan changes this month."],
    });
  }

  for (const report of reports) {
    await writeReport(report);
  }
  await writeIndex(reports);

  console.log(`Mock billing simulation complete.`);
  console.log(`Users created: ${users.length}`);
  console.log(`Ledger: ${MOCK_BILLING_LEDGER_PATH}`);
  console.log(`Reports: ${MOCK_BILLING_REPORT_DIR}`);
}

main().finally(async () => {
  await prisma.$disconnect();
});
