import assert from "node:assert/strict";
import test from "node:test";

import { marketplaceSearchSchema } from "./marketplace.contracts";
import { buildMarketplaceSearchSql } from "./marketplace-search.service";

test("marketplace search excludes records imported from the auditor directory", () => {
  const query = buildMarketplaceSearchSql(marketplaceSearchSchema.parse({}), 0);
  assert.match(query.sql, /sourceProfileSync[^]*IS DISTINCT FROM 'true'/);
});
