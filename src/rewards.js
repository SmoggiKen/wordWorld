export function levelForXp(xp) {
  return Math.max(1, Math.floor(xp / 100) + 1);
}

export function calculateRewards(criteria, aiResults) {
  const matched = [];
  let xpAwarded = 0;

  for (const criterion of criteria) {
    const value = Boolean(aiResults[criterion.key]);
    const awarded = value ? criterion.xp_reward : 0;

    if (value) {
      xpAwarded += awarded;
      matched.push({
        criterionId: criterion.id,
        key: criterion.key,
        label: criterion.label,
        xpAwarded: awarded,
        unlockItemKey: criterion.unlock_item_key
      });
    }
  }

  return { xpAwarded, matched };
}
