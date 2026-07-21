import assert from "node:assert/strict";
import test from "node:test";
import { findScientologyOrgs } from "./scientology-orgs";

test("Org and AO search ranks abbreviations, names, and cities", () => {
  assert.equal(findScientologyOrgs("AOLA")[0]?.organization, "Advanced Organization of Los Angeles");
  assert.equal(findScientologyOrgs("Austin")[0]?.organization, "Church of Scientology of Austin");
  assert.ok(findScientologyOrgs("Saint Hill").some((org) => org.organization.includes("Saint Hill")));
});

test("Org search is normalized and bounded", () => {
  assert.deepEqual(
    findScientologyOrgs("  aola  ", 1).map((org) => org.organization),
    ["Advanced Organization of Los Angeles"]
  );
  assert.equal(findScientologyOrgs("org", 3).length, 3);
});
