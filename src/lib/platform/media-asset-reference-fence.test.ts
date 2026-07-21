import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { MediaAssetStatus, type Prisma } from "@prisma/client";
import ts from "typescript";
import {
  getMediaAssetReferenceErrorMessage,
  lockReadyMediaAssetsForReference,
  MediaAssetReferenceFenceError,
  withMediaAssetReferenceValidation
} from "@/lib/platform/media-asset-reference-fence";

function fakeTransaction(input: { status?: MediaAssetStatus; missingAsset?: boolean } = {}) {
  const events: string[] = [];
  const lockValues: unknown[][] = [];
  let rawCall = 0;
  const ownership = input.missingAsset
    ? [{ id: "asset-b", ownerUserId: "owner-b" }]
    : [
        { id: "asset-b", ownerUserId: "owner-b" },
        { id: "asset-a", ownerUserId: "owner-a" }
      ];
  const tx = {
    mediaAsset: {
      findMany: async () => {
        events.push("ownership-read");
        return ownership;
      }
    },
    $queryRaw: async (query: { values?: unknown[] }) => {
      rawCall += 1;
      lockValues.push(query.values ?? []);
      if (rawCall === 1) {
        events.push("owners-locked");
        return (query.values ?? []).map((id) => ({ id }));
      }
      events.push("assets-locked");
      return [
        { id: "asset-a", ownerUserId: "owner-a", status: input.status ?? MediaAssetStatus.READY },
        { id: "asset-b", ownerUserId: "owner-b", status: MediaAssetStatus.READY }
      ];
    }
  } as unknown as Prisma.TransactionClient;
  return { tx, events, lockValues };
}

function loadFunction(file: string, functionName: string) {
  const source = readFileSync(resolve(file), "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
      found = node;
      return;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert.ok(found, `${file} must export ${functionName}`);
  return { sourceFile, functionNode: found };
}

function functionHasMappedOperation(file: string, functionName: string, operationMarker: string) {
  const { sourceFile, functionNode } = loadFunction(file, functionName);
  let matched = false;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "withMediaAssetReferenceValidation" &&
      node.getText(sourceFile).includes(operationMarker)
    ) {
      matched = true;
      return;
    }
    if (!matched) ts.forEachChild(node, visit);
  };
  visit(functionNode);
  return matched;
}

function functionHasTryMappedOperation(file: string, functionName: string, operationMarker: string) {
  const { sourceFile, functionNode } = loadFunction(file, functionName);
  let matched = false;
  const visit = (node: ts.Node) => {
    if (
      ts.isTryStatement(node) &&
      node.tryBlock.getText(sourceFile).includes(operationMarker) &&
      Boolean(node.catchClause?.getText(sourceFile).includes("getMediaAssetReferenceErrorMessage"))
    ) {
      matched = true;
      return;
    }
    if (!matched) ts.forEachChild(node, visit);
  };
  visit(functionNode);
  return matched;
}

test("media references lock owners before sorted assets and require READY", async () => {
  const { tx, events, lockValues } = fakeTransaction();
  const assets = await lockReadyMediaAssetsForReference(
    tx,
    ["asset-b", "asset-a", "asset-b"],
    { additionalUserIds: ["owner-b", "actor-z", "actor-a"] }
  );
  assert.deepEqual(events, ["ownership-read", "owners-locked", "assets-locked"]);
  assert.deepEqual(assets.map((asset) => asset.id), ["asset-a", "asset-b"]);
  assert.deepEqual(lockValues[0], ["actor-a", "actor-z", "owner-a", "owner-b"]);
  assert.deepEqual(lockValues[1], ["asset-a", "asset-b"]);
});

test("media reference fencing rejects a missing asset before relation creation", async () => {
  const { tx, events } = fakeTransaction({ missingAsset: true });
  await assert.rejects(
    () => lockReadyMediaAssetsForReference(tx, ["asset-a", "asset-b"]),
    MediaAssetReferenceFenceError
  );
  assert.deepEqual(events, ["ownership-read"]);
});

test("media reference fencing rejects an asset that entered deletion", async () => {
  const { tx, events } = fakeTransaction({ status: MediaAssetStatus.DELETING });
  await assert.rejects(
    () => lockReadyMediaAssetsForReference(tx, ["asset-a", "asset-b"]),
    MediaAssetReferenceFenceError
  );
  assert.deepEqual(events, ["ownership-read", "owners-locked", "assets-locked"]);
});

test("an empty reference set is a no-op", async () => {
  const { tx, events } = fakeTransaction();
  assert.deepEqual(await lockReadyMediaAssetsForReference(tx, []), []);
  assert.deepEqual(events, []);
});

test("reference validation maps direct fence errors and nested database trigger errors", async () => {
  const direct = await withMediaAssetReferenceValidation(async () => {
    throw new MediaAssetReferenceFenceError();
  });
  assert.deepEqual(direct, {
    ok: false,
    error: "One or more media files are no longer available."
  });

  const databaseError = {
    code: "P2004",
    meta: {
      database_error: {
        code: "23514",
        constraint: "MEDIA_ASSET_REFERENCE_FENCE"
      }
    }
  };
  assert.equal(
    getMediaAssetReferenceErrorMessage(databaseError),
    "One or more media files are no longer available."
  );
  assert.equal(
    getMediaAssetReferenceErrorMessage(new Error("Referenced media asset is not ready.")),
    "One or more media files are no longer available."
  );
});

test("reference validation does not relabel unrelated database constraints", async () => {
  const unrelatedError = {
    code: "P2004",
    meta: { database_error: "A different check constraint failed." }
  };
  assert.equal(getMediaAssetReferenceErrorMessage(unrelatedError), null);
  await assert.rejects(
    () => withMediaAssetReferenceValidation(async () => {
      throw unrelatedError;
    }),
    (error) => error === unrelatedError
  );
});

test("newly inserted upload assets are not fenced again before their owning reference is created", () => {
  const cases = [
    {
      file: "src/modules/group-media-docs/group-media-docs.service.ts",
      assetCreate: "transaction.mediaAsset.create",
      referenceCreate: "transaction.groupAsset.create"
    },
    {
      file: "src/modules/my-scientology/my-scientology.service.ts",
      assetCreate: "transaction.mediaAsset.create",
      referenceCreate: "transaction.scientologyCommendation.create"
    }
  ];

  for (const item of cases) {
    const source = readFileSync(resolve(item.file), "utf8");
    const assetCreateIndex = source.indexOf(item.assetCreate);
    const referenceCreateIndex = source.indexOf(item.referenceCreate, assetCreateIndex);
    assert.notEqual(assetCreateIndex, -1, `${item.file} must create its media asset`);
    assert.notEqual(referenceCreateIndex, -1, `${item.file} must create its owning reference`);
    assert.doesNotMatch(
      source.slice(assetCreateIndex, referenceCreateIndex),
      /lockReadyMediaAssetsForReference/,
      `${item.file} must not upgrade the owner lock after inserting its media asset`
    );
  }
});

test("each media-reference writer maps failures in the function that performs the fenced operation", () => {
  const cases = [
    ["src/modules/ads-credits/ads-credits.service.ts", "createAdCampaign", "lockReadyMediaAssetsForReference"],
    ["src/modules/business-storefront/business-storefront.service.ts", "createBusinessArticle", "lockReadyMediaAssetsForReference"],
    ["src/modules/chat-messages/chat-messages.service.ts", "sendChatMessage", "lockReadyMediaAssetsForReference"],
    ["src/modules/feed-stream/feed-stream.service.ts", "createFeedPost", "assertNewFeedPostWriteAllowed"],
    ["src/modules/feed-stream/feed-stream.service.ts", "createFeedComment", "assertFeedChildWriteAllowed"],
    ["src/modules/feed-stream/feed-retention.service.ts", "importFeedThread", "assertNewFeedPostWriteAllowed"],
    ["src/modules/group-forum/group-forum.service.ts", "createGroupForumPost", "lockReadyMediaAssetsForReference"],
    ["src/modules/mail/mail.service.ts", "sendMail", "lockReadyMediaAssetsForReference"],
    ["src/modules/market/market.service.ts", "createMarketListing", "lockReadyMediaAssetsForReference"],
    ["src/modules/market/market.service.ts", "updateMarketListing", "lockReadyMediaAssetsForReference"],
    ["src/modules/my-scientology/my-scientology.service.ts", "completeScientologyCommendationUpload", "transaction.scientologyCommendation.create"]
  ] as const;

  for (const [file, functionName, operationMarker] of cases) {
    assert.ok(
      functionHasMappedOperation(file, functionName, operationMarker),
      `${functionName} must map the operation that creates its media reference`
    );
  }

  assert.ok(
    functionHasTryMappedOperation(
      "src/modules/group-media-docs/group-media-docs.service.ts",
      "completeGroupAssetUpload",
      "transaction.groupAsset.create"
    ),
    "completeGroupAssetUpload must catch media-reference errors from its GroupAsset creation operation"
  );
});

test("database migration fences every external gallery-deletion dependency", () => {
  const migration = readFileSync(resolve(
    "prisma/migrations/20260721150000_media_asset_reference_fence/migration.sql"
  ), "utf8");
  const expectedTargets = [
    ["FeedPost", "mediaAssetId"],
    ["FeedComment", "mediaAssetId"],
    ["AdCampaign", "imageMediaAssetId"],
    ["AdCampaignCreative", "mediaAssetId"],
    ["BusinessArticle", "coverMediaAssetId"],
    ["ChatAttachment", "mediaAssetId"],
    ["MailAttachment", "mediaAssetId"],
    ["GroupForumPost", "mediaAssetId"],
    ["GroupAsset", "mediaAssetId"],
    ["MarketListingPhoto", "mediaAssetId"],
    ["ScientologyCommendation", "mediaAssetId"]
  ];

  for (const [table, column] of expectedTargets) {
    assert.match(migration, new RegExp(`ON "${table}"[\\s\\S]*?NEW\\."${column}"`));
  }
  assert.match(migration, /FROM "MediaAsset"[\s\S]*?FOR UPDATE/);
  assert.doesNotMatch(migration, /FROM "User"/);
  assert.match(migration, /referenced_status IS DISTINCT FROM 'READY'::"MediaAssetStatus"/);
  assert.match(migration, /CONSTRAINT = 'MEDIA_ASSET_REFERENCE_FENCE'/);
});
