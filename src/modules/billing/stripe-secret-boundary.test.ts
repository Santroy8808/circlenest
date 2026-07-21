import assert from "node:assert/strict";
import test from "node:test";
import { StripeIntegrationMode } from "@prisma/client";
import { EnvironmentSecretStore } from "@/modules/billing/environment-secret-store";
import { stripeConnectionSchema } from "@/modules/billing/stripe-admin.service";

test("environment secret store resolves only valid environment references", async () => {
  const variable = "THETA_TEST_SECRET_BOUNDARY";
  const previous = process.env[variable];
  process.env[variable] = "  secret-value  ";
  try {
    const store = new EnvironmentSecretStore();
    const reference = { provider: "environment" as const, environmentVariable: variable };
    assert.equal(await store.resolve(reference), "secret-value");
    assert.deepEqual(await store.describe(reference), {
      reference,
      configured: true,
      source: "environment"
    });
    await assert.rejects(
      () => store.resolve({ provider: "environment", environmentVariable: "bad-variable" }),
      /Invalid secret environment-variable reference/
    );
  } finally {
    if (previous === undefined) delete process.env[variable];
    else process.env[variable] = previous;
  }
});

test("Stripe connection contract rejects raw secrets and accepts environment references", () => {
  const base = {
    commandId: "stripe-command-001",
    mode: StripeIntegrationMode.TEST,
    currency: "usd",
    subscriptionCheckoutEnabled: true,
    creditCheckoutEnabled: false
  };
  assert.equal(stripeConnectionSchema.safeParse({
    ...base,
    secretKey: "sk_test_raw_secret",
    webhookSecret: "whsec_raw_secret"
  }).success, false);
  assert.equal(stripeConnectionSchema.safeParse({
    ...base,
    secretKey: "",
    webhookSecret: "",
    secretKeyEnvVar: "STRIPE_SECRET_KEY",
    webhookSecretEnvVar: "STRIPE_WEBHOOK_SECRET"
  }).success, true);
});
