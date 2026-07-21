-- Contributor includes ten recurring platform credits during beta. The worker
-- allocates them idempotently once per UTC calendar month.
UPDATE "SubscriptionPlanRule"
SET "monthlyCreditBudget" = 10
WHERE "tier" = 'CONTRIBUTOR';
