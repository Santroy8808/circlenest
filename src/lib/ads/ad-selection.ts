export function resolveAdRotationSeed(now = new Date()) {
  return Math.floor(now.getTime() / 1000);
}

type WeightedAd = {
  creditCost?: number | null;
  boostFactor?: number | null;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
};

function resolveAdWeight(ad: WeightedAd) {
  const baseSpend = Math.max(1, Number(ad.creditCost ?? 0));
  const boost = Math.max(1, Number(ad.boostFactor ?? 1));
  const startTime = ad.startsAt ? new Date(ad.startsAt).getTime() : null;
  const endTime = ad.endsAt ? new Date(ad.endsAt).getTime() : null;
  const durationMs = startTime !== null && endTime !== null && Number.isFinite(startTime) && Number.isFinite(endTime) && endTime > startTime ? endTime - startTime : null;
  const durationWeight = durationMs ? Math.max(1, Math.round((24 * 60 * 60 * 1000) / durationMs)) : 1;
  return Math.max(1, Math.round(baseSpend * boost * durationWeight));
}

export function pickRotatingAd<T extends WeightedAd>(ads: readonly T[], slotIndex: number, seed = resolveAdRotationSeed()) {
  if (!ads.length) return null;
  const weights = ads.map((ad) => resolveAdWeight(ad));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) return ads[(Math.abs(seed) + slotIndex) % ads.length];

  const seedOffset = Math.abs(seed + slotIndex) % totalWeight;
  let runningTotal = 0;
  for (let index = 0; index < ads.length; index += 1) {
    runningTotal += weights[index];
    if (seedOffset < runningTotal) {
      return ads[index];
    }
  }

  return ads[ads.length - 1] ?? null;
}
