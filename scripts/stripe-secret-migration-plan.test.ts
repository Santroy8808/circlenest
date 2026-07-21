import assert from "node:assert/strict";
import test from "node:test";
import {
  assessStripeSecretMigrationReceipt,
  assessStripeSecretColumns,
  isValidStripeSecretMigrationReceipt,
  planStripeSecretMigration,
  safeStripeSecretPreflightFailure,
  STRIPE_SECRET_MIGRATION_ID,
  STRIPE_SECRET_MIGRATION_RECEIPT,
  StripeSecretPreflightError
} from "./stripe-secret-migration-plan";

const allColumns = [
  "id",
  "secretKey",
  "webhookSecret",
  "secretKeyEnvVar",
  "webhookSecretEnvVar"
];

test("column assessment detects pending, completed, and partial schemas", () => {
  assert.deepEqual(assessStripeSecretColumns(allColumns), { status: "requires-migration" });
  assert.deepEqual(
    assessStripeSecretColumns(["id", "secretKeyEnvVar", "webhookSecretEnvVar"]),
    { status: "already-removed" }
  );
  assert.throws(
    () => assessStripeSecretColumns(allColumns.filter((column) => column !== "webhookSecret")),
    (error: unknown) => error instanceof StripeSecretPreflightError && error.code === "SCHEMA_INVALID"
  );
});

test("legacy values require exact server matches and receive default references", () => {
  const plan = planStripeSecretMigration(
    [{
      id: "default",
      secretKey: " sk_test_exact ",
      webhookSecret: "whsec_exact",
      secretKeyEnvVar: null,
      webhookSecretEnvVar: null
    }],
    {
      STRIPE_SECRET_KEY: " sk_test_exact ",
      STRIPE_WEBHOOK_SECRET: "whsec_exact"
    }
  );

  assert.deepEqual(plan, [{
    id: "default",
    secretKeyEnvVar: "STRIPE_SECRET_KEY",
    webhookSecretEnvVar: "STRIPE_WEBHOOK_SECRET",
    secretKeyHadLegacyValue: true,
    webhookSecretHadLegacyValue: true,
    referenceChanged: true
  }]);
});

test("never-configured rows stay unconfigured and do not require server variables", () => {
  const plan = planStripeSecretMigration(
    [{
      id: "default",
      secretKey: "   ",
      webhookSecret: "",
      secretKeyEnvVar: null,
      webhookSecretEnvVar: "   "
    }],
    {}
  );

  assert.equal(plan[0]?.secretKeyEnvVar, null);
  assert.equal(plan[0]?.webhookSecretEnvVar, null);
  assert.equal(plan[0]?.secretKeyHadLegacyValue, false);
  assert.equal(plan[0]?.webhookSecretHadLegacyValue, false);
});

test("an explicit reference without a legacy value is preserved", () => {
  const plan = planStripeSecretMigration(
    [{
      id: "default",
      secretKey: null,
      webhookSecret: null,
      secretKeyEnvVar: "STRIPE_ROTATED_SECRET_KEY",
      webhookSecretEnvVar: null
    }],
    {}
  );

  assert.equal(plan[0]?.secretKeyEnvVar, "STRIPE_ROTATED_SECRET_KEY");
  assert.equal(plan[0]?.referenceChanged, false);
});

test("missing or mismatched server values fail without exposing secret material", () => {
  const legacySecret = "sk_test_do_not_log";
  const row = {
    id: "default",
    secretKey: legacySecret,
    webhookSecret: null,
    secretKeyEnvVar: "STRIPE_SECRET_KEY",
    webhookSecretEnvVar: null
  };

  assert.throws(
    () => planStripeSecretMigration([row], {}),
    (error: unknown) => error instanceof StripeSecretPreflightError &&
      error.code === "ENV_SECRET_MISSING" &&
      !error.message.includes(legacySecret)
  );
  assert.throws(
    () => planStripeSecretMigration([row], { STRIPE_SECRET_KEY: "different" }),
    (error: unknown) => error instanceof StripeSecretPreflightError &&
      error.code === "ENV_SECRET_MISMATCH" &&
      !error.message.includes(legacySecret) &&
      !error.message.includes("different")
  );
});

test("the deterministic receipt contract accepts only non-secret immutable receipt data", () => {
  const receipt = {
    id: STRIPE_SECRET_MIGRATION_RECEIPT.id,
    operationId: STRIPE_SECRET_MIGRATION_RECEIPT.operationId,
    module: STRIPE_SECRET_MIGRATION_RECEIPT.module,
    action: STRIPE_SECRET_MIGRATION_RECEIPT.action,
    targetType: STRIPE_SECRET_MIGRATION_RECEIPT.targetType,
    targetId: STRIPE_SECRET_MIGRATION_ID,
    severity: STRIPE_SECRET_MIGRATION_RECEIPT.severity,
    outcome: STRIPE_SECRET_MIGRATION_RECEIPT.outcome,
    retentionClass: STRIPE_SECRET_MIGRATION_RECEIPT.retentionClass,
    actorUserId: null,
    requestId: null,
    beforeIsNull: true,
    afterIsNull: true,
    metadata: {
      receiptVersion: STRIPE_SECRET_MIGRATION_RECEIPT.receiptVersion,
      migrationId: STRIPE_SECRET_MIGRATION_ID,
      result: STRIPE_SECRET_MIGRATION_RECEIPT.result,
      configCount: 1,
      secretKeyCount: 1,
      webhookSecretCount: 0,
      referenceUpdateCount: 1,
      secretMaterialRecorded: false
    }
  };

  assert.equal(isValidStripeSecretMigrationReceipt(receipt), true);
  assert.deepEqual(assessStripeSecretMigrationReceipt(null), { status: "create" });
  assert.deepEqual(assessStripeSecretMigrationReceipt(receipt), { status: "reuse" });
  assert.equal(
    isValidStripeSecretMigrationReceipt({
      ...receipt,
      metadata: { ...receipt.metadata, unexpected: "must-not-be-persisted" }
    }),
    false
  );
  assert.equal(isValidStripeSecretMigrationReceipt({ ...receipt, beforeIsNull: false }), false);
});

test("unexpected database errors are reduced to a fixed non-sensitive failure", () => {
  const leakedValues = "database error included sk_test_secret and postgresql://user:password@host/db";
  const failure = safeStripeSecretPreflightFailure(new Error(leakedValues));

  assert.deepEqual(failure, {
    code: "UNEXPECTED_DATABASE_ERROR",
    message: "The Stripe secret preflight failed and its transaction was rolled back."
  });
  assert.equal(JSON.stringify(failure).includes("sk_test_secret"), false);
  assert.equal(JSON.stringify(failure).includes("password"), false);

  const knownFailure = new StripeSecretPreflightError("ENV_SECRET_MISMATCH");
  knownFailure.message = leakedValues;
  assert.deepEqual(safeStripeSecretPreflightFailure(knownFailure), {
    code: "ENV_SECRET_MISMATCH",
    message: "A legacy Stripe secret does not exactly match its server environment value."
  });
});
