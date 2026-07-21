import allCities from "all-the-cities";

export type CityLocationSuggestion = {
  city: string;
  country: string;
  label: string;
  region: string;
};

type WorldCity = {
  adminCode?: string;
  altName?: string;
  cityId: number;
  country: string;
  featureCode?: string;
  name: string;
  population?: number;
};

type CityLocationRecord = {
  aliases?: string[];
  city: string;
  country: string;
  label: string;
  priority: number;
  region: string;
  searchValues: Array<{ value: string; weight: number }>;
};

type RankedCityLocationRecord = {
  record: CityLocationRecord;
  score: number;
};

type CityLocationSearchIndex = {
  prefixBuckets: Map<string, number[]>;
  records: CityLocationRecord[];
};

type PreparedCityLocationQuery = {
  compact: string;
  normalized: string;
  terms: string[];
};

export const CITY_LOCATION_MIN_QUERY_LENGTH = 2;
export const CITY_LOCATION_RECOMMENDED_DEBOUNCE_MS = 180;

const CITY_LOCATION_RESULT_CACHE_LIMIT = 256;
const CITY_LOCATION_PREFIX_LENGTH = 2;
const CITY_LOCATION_LATENCY_SAMPLE_LIMIT = 256;
const cityLocationLatencySamples: number[] = [];
const normalizedSharedLocationTerms = new Map<string, string>();

const POPULAR_CITY_LABELS = [
  "New York, New York, United States",
  "Los Angeles, California, United States",
  "Chicago, Illinois, United States",
  "Houston, Texas, United States",
  "Phoenix, Arizona, United States",
  "Philadelphia, Pennsylvania, United States",
  "San Antonio, Texas, United States",
  "San Diego, California, United States",
  "Dallas, Texas, United States",
  "Austin, Texas, United States",
  "Fort Worth, Texas, United States",
  "San Jose, California, United States",
  "Columbus, Ohio, United States",
  "Charlotte, North Carolina, United States",
  "Indianapolis, Indiana, United States",
  "San Francisco, California, United States",
  "Seattle, Washington, United States",
  "Denver, Colorado, United States",
  "Washington, District of Columbia, United States",
  "Boston, Massachusetts, United States",
  "Detroit, Michigan, United States",
  "Portland, Oregon, United States",
  "Las Vegas, Nevada, United States",
  "Atlanta, Georgia, United States",
  "Miami, Florida, United States",
  "Orlando, Florida, United States",
  "Tampa, Florida, United States",
  "Nashville, Tennessee, United States",
  "Salt Lake City, Utah, United States",
  "Sacramento, California, United States",
  "Toronto, Ontario, Canada",
  "Vancouver, British Columbia, Canada",
  "Montréal, Québec, Canada",
  "Québec City, Québec, Canada",
  "Calgary, Alberta, Canada",
  "Ottawa, Ontario, Canada",
  "London, England, United Kingdom",
  "Birmingham, England, United Kingdom",
  "Manchester, England, United Kingdom",
  "Dublin, Leinster, Ireland",
  "Paris, Île-de-France, France",
  "Madrid, Madrid, Spain",
  "Barcelona, Catalonia, Spain",
  "Rome, Lazio, Italy",
  "Milan, Lombardy, Italy",
  "Berlin, Berlin, Germany",
  "Hamburg, Hamburg, Germany",
  "Munich, Bavaria, Germany",
  "Copenhagen, Capital Region of Denmark, Denmark",
  "Amsterdam, North Holland, Netherlands",
  "Brussels, Brussels-Capital Region, Belgium",
  "Stockholm, Stockholm County, Sweden",
  "Oslo, Oslo, Norway",
  "Helsinki, Uusimaa, Finland",
  "Vienna, Vienna, Austria",
  "Zurich, Zurich, Switzerland",
  "Geneva, Geneva, Switzerland",
  "Budapest, Budapest, Hungary",
  "Athens, Attica, Greece",
  "Lisbon, Lisbon, Portugal",
  "Mexico City, Mexico City, Mexico",
  "Bogotá, Bogota D.C., Colombia",
  "Buenos Aires, Buenos Aires F.D., Argentina",
  "São Paulo, São Paulo, Brazil",
  "Rio de Janeiro, Rio de Janeiro, Brazil",
  "Santiago, Santiago Metropolitan, Chile",
  "Lima, Lima, Peru",
  "Sydney, New South Wales, Australia",
  "Melbourne, Victoria, Australia",
  "Brisbane, Queensland, Australia",
  "Perth, Western Australia, Australia",
  "Auckland, Auckland, New Zealand",
  "Johannesburg, Gauteng, South Africa",
  "Pretoria, Gauteng, South Africa",
  "Cape Town, Western Cape, South Africa",
  "Tokyo, Tokyo, Japan",
  "Taipei, Taiwan, Taiwan",
  "Kaohsiung, Kaohsiung, Taiwan",
  "Tel Aviv, Tel Aviv District, Israel"
];

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
const COUNTRY_NAME_CACHE = new Map<string, string>();

const REGION_NAMES_BY_COUNTRY: Record<string, Record<string, string>> = {
  AU: {
    "01": "Australian Capital Territory",
    "02": "New South Wales",
    "03": "Northern Territory",
    "04": "Queensland",
    "05": "South Australia",
    "06": "Tasmania",
    "07": "Victoria",
    "08": "Western Australia",
    ACT: "Australian Capital Territory",
    NSW: "New South Wales",
    NT: "Northern Territory",
    QLD: "Queensland",
    SA: "South Australia",
    TAS: "Tasmania",
    VIC: "Victoria",
    WA: "Western Australia"
  },
  CA: {
    "01": "Alberta",
    "02": "British Columbia",
    "03": "Manitoba",
    "04": "New Brunswick",
    "05": "Newfoundland and Labrador",
    "07": "Nova Scotia",
    "08": "Ontario",
    "09": "Prince Edward Island",
    "10": "Québec",
    "11": "Saskatchewan",
    "12": "Yukon",
    "13": "Northwest Territories",
    "14": "Nunavut",
    AB: "Alberta",
    BC: "British Columbia",
    MB: "Manitoba",
    NB: "New Brunswick",
    NL: "Newfoundland and Labrador",
    NS: "Nova Scotia",
    NT: "Northwest Territories",
    NU: "Nunavut",
    ON: "Ontario",
    PE: "Prince Edward Island",
    QC: "Québec",
    SK: "Saskatchewan",
    YT: "Yukon"
  },
  GB: {
    ENG: "England",
    NIR: "Northern Ireland",
    SCT: "Scotland",
    WLS: "Wales"
  },
  DK: {
    "17": "Capital Region of Denmark"
  },
  FR: {
    "11": "Île-de-France"
  },
  TW: {
    "02": "Kaohsiung",
    "04": "Taiwan"
  },
  US: {
    AK: "Alaska",
    AL: "Alabama",
    AR: "Arkansas",
    AZ: "Arizona",
    CA: "California",
    CO: "Colorado",
    CT: "Connecticut",
    DC: "District of Columbia",
    DE: "Delaware",
    FL: "Florida",
    GA: "Georgia",
    HI: "Hawaii",
    IA: "Iowa",
    ID: "Idaho",
    IL: "Illinois",
    IN: "Indiana",
    KS: "Kansas",
    KY: "Kentucky",
    LA: "Louisiana",
    MA: "Massachusetts",
    MD: "Maryland",
    ME: "Maine",
    MI: "Michigan",
    MN: "Minnesota",
    MO: "Missouri",
    MS: "Mississippi",
    MT: "Montana",
    NC: "North Carolina",
    ND: "North Dakota",
    NE: "Nebraska",
    NH: "New Hampshire",
    NJ: "New Jersey",
    NM: "New Mexico",
    NV: "Nevada",
    NY: "New York",
    OH: "Ohio",
    OK: "Oklahoma",
    OR: "Oregon",
    PA: "Pennsylvania",
    PR: "Puerto Rico",
    RI: "Rhode Island",
    SC: "South Carolina",
    SD: "South Dakota",
    TN: "Tennessee",
    TX: "Texas",
    UT: "Utah",
    VA: "Virginia",
    VT: "Vermont",
    WA: "Washington",
    WI: "Wisconsin",
    WV: "West Virginia",
    WY: "Wyoming"
  },
  ZA: {
    "06": "Gauteng",
    "11": "Western Cape",
    EC: "Eastern Cape",
    FS: "Free State",
    GP: "Gauteng",
    KZN: "KwaZulu-Natal",
    LP: "Limpopo",
    MP: "Mpumalanga",
    NC: "Northern Cape",
    NW: "North West",
    WC: "Western Cape"
  }
};

const CITY_ALIASES_BY_LABEL = new Map<string, string[]>([
  [compact("Los Angeles, California, United States"), ["LA", "L.A."]],
  [compact("New York, New York, United States"), ["NYC", "New York City"]],
  [compact("Washington, District of Columbia, United States"), ["DC", "Washington DC", "Washington D.C."]],
  [compact("San Francisco, California, United States"), ["SF"]],
  [compact("Saint Paul, Minnesota, United States"), ["St Paul", "St. Paul"]],
  [compact("St. Louis, Missouri, United States"), ["Saint Louis", "St Louis"]],
  [compact("St. Petersburg, Florida, United States"), ["Saint Petersburg", "St Petersburg"]],
  [compact("Montréal, Québec, Canada"), ["Montreal"]]
]);

const POPULAR_CITY_PRIORITY = new Map(POPULAR_CITY_LABELS.map((label, index) => [compact(label), index + 1]));

let cachedWorldCitySearchIndex: CityLocationSearchIndex | null = null;
const cachedWorldCitySearchResults = new Map<string, RankedCityLocationRecord[]>();

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compact(value: string) {
  return normalizeSearch(value).replace(/\s+/g, "");
}

function normalizeSharedLocationTerm(value: string) {
  const cached = normalizedSharedLocationTerms.get(value);
  if (cached !== undefined) return cached;
  const normalized = normalizeSearch(value);
  normalizedSharedLocationTerms.set(value, normalized);
  return normalized;
}

function countryName(countryCode: string) {
  const cached = COUNTRY_NAME_CACHE.get(countryCode);
  if (cached) return cached;
  const name = COUNTRY_NAMES.of(countryCode) ?? countryCode;
  COUNTRY_NAME_CACHE.set(countryCode, name);
  return name;
}

function regionName(city: WorldCity) {
  const adminCode = city.adminCode?.trim() ?? "";
  if (!adminCode) return "";
  return REGION_NAMES_BY_COUNTRY[city.country]?.[adminCode] ?? adminCode;
}

function buildSearchValues({
  aliases,
  city,
  country,
  normalizedLabel,
  region
}: {
  aliases: string[];
  city: string;
  country: string;
  normalizedLabel: string;
  region: string;
}) {
  const values = [
    { value: normalizeSearch(city), weight: 0 },
    ...aliases.map((alias) => ({ value: normalizeSearch(alias), weight: 0 })),
    { value: normalizedLabel, weight: 2 },
    { value: normalizeSharedLocationTerm(region), weight: 8 },
    { value: normalizeSharedLocationTerm(country), weight: 25 }
  ];
  const seen = new Set<string>();

  return values
    .filter(({ value }) => Boolean(value))
    .filter(({ value }) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function cityRecordFromParts({
  aliases = [],
  city,
  country,
  fallbackPriority,
  label,
  region
}: {
  aliases?: string[];
  city: string;
  country: string;
  fallbackPriority: number;
  label: string;
  region: string;
}): CityLocationRecord {
  const normalizedLabel = normalizeSearch(label);
  const labelKey = normalizedLabel.replace(/\s+/g, "");
  const priority = POPULAR_CITY_PRIORITY.get(labelKey) ?? fallbackPriority;
  const mergedAliases = [...aliases, ...(CITY_ALIASES_BY_LABEL.get(labelKey) ?? [])];

  return {
    aliases: mergedAliases,
    city,
    country,
    label,
    priority,
    region,
    searchValues: buildSearchValues({ aliases: mergedAliases, city, country, normalizedLabel, region })
  };
}

function cityRecordFromLabel(label: string, index: number): CityLocationRecord | null {
  const parts = label
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return null;

  return cityRecordFromParts({
    city: parts[0],
    country: parts.length > 2 ? parts.slice(2).join(", ") : parts[1],
    fallbackPriority: index + 1,
    label,
    region: parts.length > 2 ? parts[1] : ""
  });
}

function addRecord(record: CityLocationRecord | null, records: CityLocationRecord[], seen: Set<string>) {
  if (!record) return;
  const key = compact(record.label);
  if (seen.has(key)) return;
  seen.add(key);
  records.push(record);
}

function normalizedSearchBucketKeys(normalized: string) {
  if (!normalized) return [];

  const keys = new Set<string>();
  for (const candidate of [normalized, ...normalized.split(" ")]) {
    const key = candidate.replace(/\s+/g, "").slice(0, CITY_LOCATION_PREFIX_LENGTH);
    if (key.length === CITY_LOCATION_PREFIX_LENGTH) keys.add(key);
  }
  return [...keys];
}

function searchBucketKeys(value: string) {
  return normalizedSearchBucketKeys(normalizeSearch(value));
}

function buildCityLocationSearchIndex(records: CityLocationRecord[]): CityLocationSearchIndex {
  const bucketSets = new Map<string, Set<number>>();

  records.forEach((record, recordIndex) => {
    const recordKeys = new Set<string>();
    for (const { value } of record.searchValues) {
      for (const key of normalizedSearchBucketKeys(value)) recordKeys.add(key);
    }

    for (const key of recordKeys) {
      const bucket = bucketSets.get(key);
      if (bucket) bucket.add(recordIndex);
      else bucketSets.set(key, new Set([recordIndex]));
    }
  });

  return {
    prefixBuckets: new Map([...bucketSets].map(([key, indexes]) => [key, [...indexes]])),
    records
  };
}

function getWorldCitySearchIndex() {
  if (cachedWorldCitySearchIndex) return cachedWorldCitySearchIndex;

  const seen = new Set<string>();
  const records: CityLocationRecord[] = [];

  POPULAR_CITY_LABELS.forEach((label, index) => {
    addRecord(cityRecordFromLabel(label, index), records, seen);
  });

  (allCities as WorldCity[]).forEach((worldCity) => {
    const city = worldCity.name?.trim();
    const country = countryName(worldCity.country);
    const region = regionName(worldCity);
    if (!city || !country) return;

    const label = `${city}${region ? `, ${region}` : ""}, ${country}`;
    const population = Math.max(worldCity.population ?? 0, 0);
    const fallbackPriority = 100_000_000 - Math.min(population, 99_999_999);

    addRecord(
      cityRecordFromParts({
        aliases: worldCity.altName ? [worldCity.altName] : [],
        city,
        country,
        fallbackPriority,
        label,
        region
      }),
      records,
      seen
    );
  });

  cachedWorldCitySearchIndex = buildCityLocationSearchIndex(records);
  return cachedWorldCitySearchIndex;
}

function cityRecordFromValue(value: string, index: number): CityLocationRecord | null {
  const cleanValue = value.replace(/\s+/g, " ").trim();
  if (cleanValue.length < 2 || cleanValue.length > 140) return null;
  if (/\d/.test(cleanValue)) return null;

  const parts = cleanValue
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const city = parts[0];
  if (!city || city.length < 2) return null;

  return cityRecordFromParts({
    city,
    country: parts.length > 2 ? parts.slice(2).join(", ") : "",
    fallbackPriority: 300_000_000 + index,
    label: cleanValue,
    region: parts[1] ?? ""
  });
}

function prepareCityLocationQuery(query: string): PreparedCityLocationQuery {
  const normalized = normalizeSearch(query);
  return {
    compact: normalized.replace(/\s+/g, ""),
    normalized,
    terms: normalized.split(" ").filter(Boolean)
  };
}

function scoreRecord(record: CityLocationRecord, query: PreparedCityLocationQuery) {
  if (query.normalized.length < CITY_LOCATION_MIN_QUERY_LENGTH) return null;

  let bestScore: number | null = null;

  for (const { value: normalizedValue, weight } of record.searchValues) {
    const compactValue = normalizedValue.replace(/\s+/g, "");
    let score: number | null = null;

    if (normalizedValue === query.normalized || compactValue === query.compact) {
      score = weight;
    } else if (normalizedValue.startsWith(query.normalized) || compactValue.startsWith(query.compact)) {
      score = weight + 10;
    } else if (normalizedValue.includes(query.normalized) || compactValue.includes(query.compact)) {
      score = weight + 40 + Math.max(normalizedValue.indexOf(query.normalized), 0);
    }

    if (score !== null) {
      bestScore = bestScore === null ? score : Math.min(bestScore, score);
    }
  }

  const normalizedLabel = normalizeSearch(record.label);
  if (query.terms.length > 1 && query.terms.every((term) => normalizedLabel.includes(term))) {
    bestScore = bestScore === null ? 70 : Math.min(bestScore, 70);
  }

  if (bestScore === null) return null;
  return bestScore * 1_000_000_000 + record.priority;
}

function insertRankedRecord(
  ranked: RankedCityLocationRecord[],
  entry: RankedCityLocationRecord,
  limit: number
) {
  let low = 0;
  let high = ranked.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (ranked[middle].score <= entry.score) low = middle + 1;
    else high = middle;
  }

  if (low >= limit) return;
  ranked.splice(low, 0, entry);
  if (ranked.length > limit) ranked.pop();
}

function rankCityRecords(records: Iterable<CityLocationRecord>, query: PreparedCityLocationQuery, limit: number) {
  const ranked: RankedCityLocationRecord[] = [];
  for (const record of records) {
    const score = scoreRecord(record, query);
    if (score === null) continue;
    insertRankedRecord(ranked, { record, score }, limit);
  }
  return ranked;
}

function getWorldCityCandidates(query: PreparedCityLocationQuery) {
  const index = getWorldCitySearchIndex();
  const queryKeys = normalizedSearchBucketKeys(query.normalized);
  const candidateIndexes = new Set<number>();

  for (const key of queryKeys) {
    for (const recordIndex of index.prefixBuckets.get(key) ?? []) candidateIndexes.add(recordIndex);
  }

  if (candidateIndexes.size === 0) return index.records;
  return [...candidateIndexes].map((recordIndex) => index.records[recordIndex]);
}

function getCachedWorldCityResults(query: PreparedCityLocationQuery, limit: number) {
  const cacheKey = `${query.normalized}:${limit}`;
  const cached = cachedWorldCitySearchResults.get(cacheKey);
  if (cached) {
    cachedWorldCitySearchResults.delete(cacheKey);
    cachedWorldCitySearchResults.set(cacheKey, cached);
    return cached;
  }

  const ranked = rankCityRecords(getWorldCityCandidates(query), query, limit);
  cachedWorldCitySearchResults.set(cacheKey, ranked);
  if (cachedWorldCitySearchResults.size > CITY_LOCATION_RESULT_CACHE_LIMIT) {
    const oldestKey = cachedWorldCitySearchResults.keys().next().value;
    if (oldestKey) cachedWorldCitySearchResults.delete(oldestKey);
  }
  return ranked;
}

function suggestionFromRecord(record: CityLocationRecord): CityLocationSuggestion {
  return {
    city: record.city,
    country: record.country,
    label: record.label,
    region: record.region
  };
}

export function warmCityLocationSearchIndex() {
  const index = getWorldCitySearchIndex();
  return {
    prefixBucketCount: index.prefixBuckets.size,
    recordCount: index.records.length
  };
}

export function getCityLocationSearchLatencySnapshot() {
  if (cityLocationLatencySamples.length === 0) {
    return { maxMs: 0, p50Ms: 0, p95Ms: 0, sampleCount: 0 };
  }

  const sorted = [...cityLocationLatencySamples].sort((left, right) => left - right);
  const percentile = (value: number) => sorted[Math.ceil(sorted.length * value) - 1] ?? 0;
  return {
    maxMs: sorted.at(-1) ?? 0,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    sampleCount: sorted.length
  };
}

function recordCityLocationSearchLatency(durationMs: number) {
  cityLocationLatencySamples.push(durationMs);
  if (cityLocationLatencySamples.length > CITY_LOCATION_LATENCY_SAMPLE_LIMIT) cityLocationLatencySamples.shift();
  if (cityLocationLatencySamples.length === 100 || cityLocationLatencySamples.length === 200) {
    console.info("[theta.location-search]", getCityLocationSearchLatencySnapshot());
  }
}

export function searchCityLocations(query: string, limit = 8, extraCityValues: string[] = []): CityLocationSuggestion[] {
  const startedAt = performance.now();
  const cleanLimit = Math.min(Math.max(limit, 1), 12);
  const preparedQuery = prepareCityLocationQuery(query);
  if (preparedQuery.normalized.length < CITY_LOCATION_MIN_QUERY_LENGTH) {
    recordCityLocationSearchLatency(performance.now() - startedAt);
    return [];
  }

  const platformRecords = extraCityValues
    .map((value, index) => cityRecordFromValue(value, index))
    .filter((record): record is CityLocationRecord => Boolean(record));

  const ranked = [
    ...getCachedWorldCityResults(preparedQuery, cleanLimit),
    ...rankCityRecords(platformRecords, preparedQuery, cleanLimit)
  ]
    .sort((left, right) => left.score - right.score);
  const seen = new Set<string>();
  const suggestions: CityLocationSuggestion[] = [];

  for (const { record } of ranked) {
    const key = compact(record.label);
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push(suggestionFromRecord(record));
    if (suggestions.length >= cleanLimit) break;
  }

  recordCityLocationSearchLatency(performance.now() - startedAt);
  return suggestions;
}
