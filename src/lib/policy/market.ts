import { getTierPolicy, type TierPolicy } from "./tier-policy";

export {
  getBazaarListingLifetimeDays as getMarketListingLifetimeDays,
  getBazaarListingMaxImageCount as getMarketListingMaxImageCount,
  getBazaarListingRollingLimit as getMarketListingRollingLimit,
} from "./tier-policy";

export function canCreateMarketListing(input: TierPolicy | string | null | undefined) {
  if (typeof input === "string" || input == null) {
    return getTierPolicy(input).canCreateBazaarListing;
  }
  return input.canCreateBazaarListing;
}
