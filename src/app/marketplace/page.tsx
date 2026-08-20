import { auth } from "@/auth";
import { MarketplaceDirectory } from "@/components/marketplace/marketplace-directory";
import { safeSearchMarketplaceListings } from "@/modules/marketplace/marketplace-search.service";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function optionalBoolean(value: string | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function optionalCurrencyCents(value: string | undefined) {
  if (!value) return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : undefined;
}

export default async function MarketplacePage({ searchParams }: { searchParams: SearchParams }) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  const query = {
    q: first(params.q),
    kind: first(params.kind),
    intent: first(params.intent),
    category: first(params.category),
    countryCode: first(params.country),
    region: first(params.region),
    city: first(params.city),
    remote: optionalBoolean(first(params.remote)),
    minPriceCents: optionalCurrencyCents(first(params.min)),
    maxPriceCents: optionalCurrencyCents(first(params.max)),
    sort: first(params.sort),
    cursor: first(params.cursor),
    limit: 24,
  };
  const results = await safeSearchMarketplaceListings(query);
  return <MarketplaceDirectory initialPage={results} query={{
    q: first(params.q), kind: first(params.kind), intent: first(params.intent), category: first(params.category), country: first(params.country), region: first(params.region), city: first(params.city), remote: first(params.remote), min: first(params.min), max: first(params.max), sort: first(params.sort), cursor: first(params.cursor), view: first(params.view),
  }} signedIn={Boolean(session?.user && !session.user.revoked)} />;
}
