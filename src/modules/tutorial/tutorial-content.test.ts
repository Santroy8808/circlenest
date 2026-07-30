import assert from "node:assert/strict";
import test from "node:test";
import {
  tutorialIconDefinitions,
  tutorialSteps
} from "@/modules/tutorial/tutorial-content";

test("the tutorial defines every icon once with a brief action description", () => {
  const ids = tutorialIconDefinitions.map((definition) => definition.id);
  assert.equal(new Set(ids).size, ids.length);

  for (const definition of tutorialIconDefinitions) {
    assert.ok(definition.label.length > 0);
    assert.match(definition.description, /[.!?]$/);
  }
});

test("the guided tutorial includes every icon definition", () => {
  const guidedIconIds = new Set(
    tutorialSteps.flatMap((step) => step.definitions?.map((definition) => definition.id) ?? [])
  );

  assert.deepEqual(
    [...guidedIconIds].sort(),
    tutorialIconDefinitions.map((definition) => definition.id).sort()
  );
});
