import test from "node:test";
import assert from "node:assert/strict";
import { calculateRewards, levelForXp } from "../src/rewards.js";

test("levelForXp uses one level per 100 XP", () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(99), 1);
  assert.equal(levelForXp(100), 2);
  assert.equal(levelForXp(250), 3);
});

test("calculateRewards awards only matched configurable criteria", () => {
  const criteria = [
    { id: "1", key: "capital_letter", label: "Capital Letter", xp_reward: 10, unlock_item_key: "capital_spark" },
    { id: "2", key: "adjective", label: "Vocabulary Gem", xp_reward: 15, unlock_item_key: "adjective_feather" }
  ];

  const result = calculateRewards(criteria, {
    capital_letter: true,
    adjective: false
  });

  assert.equal(result.xpAwarded, 10);
  assert.deepEqual(result.matched, [
    {
      criterionId: "1",
      key: "capital_letter",
      label: "Capital Letter",
      xpAwarded: 10,
      unlockItemKey: "capital_spark"
    }
  ]);
});
