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

let cachedWorldCityRecords: CityLocationRecord[] | null = null;

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

function countryName(countryCode: string) {
  return COUNTRY_NAMES.of(countryCode) ?? countryCode;
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
  label,
  region
}: {
  aliases: string[];
  city: string;
  country: string;
  label: string;
  region: string;
}) {
  const values = [
    { raw: city, weight: 0 },
    ...aliases.map((alias) => ({ raw: alias, weight: 0 })),
    { raw: label, weight: 2 },
    { raw: region, weight: 8 },
    { raw: country, weight: 25 }
  ];
  const seen = new Set<string>();

  return values
    .map(({ raw, weight }) => ({ value: normalizeSearch(raw), weight }))
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
  const labelKey = compact(label);
  const priority = POPULAR_CITY_PRIORITY.get(labelKey) ?? fallbackPriority;
  const mergedAliases = [...aliases, ...(CITY_ALIASES_BY_LABEL.get(labelKey) ?? [])];

  return {
    aliases: mergedAliases,
    city,
    country,
    label,
    priority,
    region,
    searchValues: buildSearchValues({ aliases: mergedAliases, city, country, label, region })
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

function getWorldCityRecords() {
  if (cachedWorldCityRecords) return cachedWorldCityRecords;

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

  cachedWorldCityRecords = records;
  return records;
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

function scoreRecord(record: CityLocationRecord, query: string) {
  const normalizedQuery = normalizeSearch(query);
  const compactQuery = compact(query);
  if (normalizedQuery.length < 2) return null;

  let bestScore: number | null = null;

  for (const { value: normalizedValue, weight } of record.searchValues) {
    const compactValue = normalizedValue.replace(/\s+/g, "");
    let score: number | null = null;

    if (normalizedValue === normalizedQuery || compactValue === compactQuery) {
      score = weight;
    } else if (normalizedValue.startsWith(normalizedQuery) || compactValue.startsWith(compactQuery)) {
      score = weight + 10;
    } else if (normalizedValue.includes(normalizedQuery) || compactValue.includes(compactQuery)) {
      score = weight + 40 + Math.max(normalizedValue.indexOf(normalizedQuery), 0);
    }

    if (score !== null) {
      bestScore = bestScore === null ? score : Math.min(bestScore, score);
    }
  }

  const terms = normalizedQuery.split(" ").filter(Boolean);
  const normalizedLabel = normalizeSearch(record.label);
  if (terms.length > 1 && terms.every((term) => normalizedLabel.includes(term))) {
    bestScore = bestScore === null ? 70 : Math.min(bestScore, 70);
  }

  if (bestScore === null) return null;
  return bestScore * 1_000_000_000 + record.priority;
}

export function searchCityLocations(query: string, limit = 8, extraCityValues: string[] = []): CityLocationSuggestion[] {
  const cleanLimit = Math.min(Math.max(limit, 1), 12);
  const platformRecords = extraCityValues
    .map((value, index) => cityRecordFromValue(value, index))
    .filter((record): record is CityLocationRecord => Boolean(record));

  const records = [...platformRecords, ...getWorldCityRecords()];
  const seen = new Set<string>();
  const suggestions: CityLocationSuggestion[] = [];

  for (const { record } of records
    .map((record) => ({ record, score: scoreRecord(record, query) }))
    .filter((entry): entry is { record: CityLocationRecord; score: number } => entry.score !== null)
    .sort((left, right) => left.score - right.score)
  ) {
    const key = compact(record.label);
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      city: record.city,
      country: record.country,
      label: record.label,
      region: record.region
    });
    if (suggestions.length >= cleanLimit) break;
  }

  return suggestions;
}
