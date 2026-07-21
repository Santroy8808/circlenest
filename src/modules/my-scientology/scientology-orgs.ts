export type ScientologyOrg = {
  aliases?: string[];
  category?: "Advanced Org" | "Celebrity Centre" | "Flag" | "Org" | "Saint Hill";
  city: string;
  country: string;
  organization: string;
};

export const scientologyOrgs: ScientologyOrg[] = [
  {
    aliases: ["Flag", "FSO"],
    category: "Flag",
    organization: "Flag Service Organization",
    city: "Clearwater, Florida",
    country: "USA"
  },
  {
    aliases: ["Freewinds", "FSSO", "Flag Ship"],
    category: "Flag",
    organization: "Flag Ship Service Organization",
    city: "Willemstad",
    country: "Curaçao"
  },
  {
    aliases: ["AOLA"],
    category: "Advanced Org",
    organization: "Advanced Organization of Los Angeles",
    city: "Los Angeles, California",
    country: "USA"
  },
  {
    aliases: ["ASHO", "American Saint Hill"],
    category: "Saint Hill",
    organization: "American Saint Hill Organization",
    city: "Los Angeles, California",
    country: "USA"
  },
  {
    aliases: ["AOSH UK", "Saint Hill UK", "Saint Hill United Kingdom"],
    category: "Advanced Org",
    organization: "Advanced Organization & Saint Hill United Kingdom",
    city: "East Grinstead, West Sussex",
    country: "United Kingdom"
  },
  {
    aliases: ["Saint Hill", "Saint Hill Manor", "SH"],
    category: "Saint Hill",
    organization: "Saint Hill Foundation",
    city: "East Grinstead, West Sussex",
    country: "United Kingdom"
  },
  {
    aliases: ["AOSH EU", "AOSH Europe", "Advanced Org Europe"],
    category: "Advanced Org",
    organization: "Advanced Organization & Saint Hill Europe",
    city: "Copenhagen",
    country: "Denmark"
  },
  {
    aliases: ["AOSH ANZO", "AOSH Australia New Zealand Oceania", "Advanced Org ANZO"],
    category: "Advanced Org",
    organization: "Advanced Organization & Saint Hill ANZO",
    city: "Sydney, New South Wales",
    country: "Australia"
  },
  {
    aliases: ["AOSH Africa", "AOSH AF", "Advanced Org Africa"],
    category: "Advanced Org",
    organization: "Advanced Organization & Saint Hill Africa",
    city: "Johannesburg",
    country: "South Africa"
  },
  { category: "Org", organization: "Church of Scientology of Atlanta", city: "Sandy Springs, Georgia", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Austin", city: "Austin, Texas", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Boston", city: "Quincy, Massachusetts", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Buffalo", city: "Buffalo, New York", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Chicago", city: "Chicago, Illinois", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Cincinnati", city: "Florence, Kentucky", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Columbus", city: "Columbus, Ohio", country: "USA" },
  { category: "Org", organization: "Church of Scientology Dallas", city: "Irving, Texas", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Denver", city: "Denver, Colorado", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Detroit", city: "Farmington Hills, Michigan", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Harlem", city: "New York, New York", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Kansas City", city: "Kansas City, Missouri", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Los Angeles", city: "Los Angeles, California", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Miami", city: "Miami, Florida", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Minneapolis", city: "Saint Paul, Minnesota", country: "USA" },
  { category: "Org", organization: "Church of Scientology of New York", city: "New York, New York", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Orange County", city: "Santa Ana, California", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Orlando", city: "Orlando, Florida", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Pasadena", city: "Pasadena, California", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Portland", city: "Portland, Oregon", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Puerto Rico", city: "San Juan, Puerto Rico", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Sacramento", city: "Sacramento, California", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Salt Lake City", city: "Salt Lake City, Utah", country: "USA" },
  { category: "Org", organization: "Church of Scientology of San Diego", city: "San Diego, California", country: "USA" },
  { category: "Org", organization: "Church of Scientology of San Francisco", city: "San Francisco, California", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Silicon Valley", city: "Mountain View, California", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Stevens Creek", city: "San Jose, California", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Tampa", city: "Tampa, Florida", country: "USA" },
  { category: "Org", organization: "Church of Scientology of the Valley", city: "North Hollywood, California", country: "USA" },
  { category: "Org", organization: "Church of Scientology of Washington State", city: "Seattle, Washington", country: "USA" },
  { category: "Org", organization: "Founding Church of Scientology", city: "Washington, D.C.", country: "USA" },
  {
    category: "Celebrity Centre",
    organization: "Church of Scientology Celebrity Centre International",
    city: "Los Angeles, California",
    country: "USA"
  },
  {
    category: "Celebrity Centre",
    organization: "Church of Scientology & Celebrity Centre Nashville",
    city: "Nashville, Tennessee",
    country: "USA"
  },
  {
    category: "Celebrity Centre",
    organization: "Church of Scientology & Celebrity Centre Las Vegas",
    city: "Las Vegas, Nevada",
    country: "USA"
  },
  { category: "Org", organization: "Church of Scientology Toronto", city: "Toronto, Ontario", country: "Canada" },
  { category: "Org", organization: "Church of Scientology Vancouver", city: "Vancouver, British Columbia", country: "Canada" },
  { category: "Org", organization: "Church of Scientology Montréal", city: "Montréal, Québec", country: "Canada" },
  { category: "Org", organization: "Church of Scientology of Québec", city: "Québec City, Québec", country: "Canada" },
  { category: "Org", organization: "Church of Scientology of Cambridge", city: "Cambridge, Ontario", country: "Canada" },
  { category: "Org", organization: "Church of Scientology Edmonton", city: "Edmonton, Alberta", country: "Canada" },
  { category: "Org", organization: "Church of Scientology Winnipeg", city: "Winnipeg, Manitoba", country: "Canada" },
  { category: "Org", organization: "Church of Scientology Amsterdam", city: "Amsterdam", country: "Netherlands" },
  { category: "Org", organization: "Churches of Scientology for Europe", city: "Brussels", country: "Belgium" },
  { category: "Org", organization: "Church of Scientology Athens", city: "Athens", country: "Greece" },
  { category: "Org", organization: "Church of Scientology Basel", city: "Basel", country: "Switzerland" },
  { category: "Org", organization: "Church of Scientology Berlin", city: "Berlin", country: "Germany" },
  { category: "Org", organization: "Church of Scientology Denmark", city: "Copenhagen", country: "Denmark" },
  { category: "Org", organization: "Church of Scientology Düsseldorf", city: "Düsseldorf", country: "Germany" },
  { category: "Org", organization: "Church of Scientology Frankfurt", city: "Frankfurt", country: "Germany" },
  { category: "Org", organization: "Church of Scientology Hamburg", city: "Hamburg", country: "Germany" },
  { category: "Org", organization: "Church of Scientology Munich", city: "Munich", country: "Germany" },
  { category: "Org", organization: "Church of Scientology Stuttgart", city: "Stuttgart", country: "Germany" },
  { category: "Org", organization: "Church of Scientology Budapest", city: "Budapest", country: "Hungary" },
  { category: "Org", organization: "Church of Scientology of London", city: "London", country: "United Kingdom" },
  { category: "Org", organization: "Church of Scientology of Birmingham", city: "Birmingham", country: "United Kingdom" },
  { category: "Org", organization: "Church of Scientology Manchester", city: "Manchester", country: "United Kingdom" },
  { category: "Org", organization: "Church of Scientology & Community Centre of Dublin", city: "Dublin", country: "Ireland" },
  { category: "Org", organization: "Church of Scientology of Madrid", city: "Madrid", country: "Spain" },
  { category: "Org", organization: "Church of Scientology of Milano", city: "Milan", country: "Italy" },
  { category: "Org", organization: "Church of Scientology of Roma", city: "Rome", country: "Italy" },
  { category: "Org", organization: "Church of Scientology of Padova", city: "Padova", country: "Italy" },
  { category: "Org", organization: "Church of Scientology of Malmö", city: "Malmö", country: "Sweden" },
  { category: "Org", organization: "Church of Scientology Stockholm", city: "Stockholm", country: "Sweden" },
  {
    category: "Celebrity Centre",
    organization: "Church of Scientology & Celebrity Centre of Greater Paris",
    city: "Saint-Denis, Paris",
    country: "France"
  },
  { category: "Org", organization: "Church of Scientology Geneva", city: "Geneva", country: "Switzerland" },
  { category: "Org", organization: "Church of Scientology Lausanne", city: "Lausanne", country: "Switzerland" },
  { category: "Org", organization: "Church of Scientology Lisbon", city: "Lisbon", country: "Portugal" },
  { category: "Org", organization: "Church of Scientology Vienna", city: "Vienna", country: "Austria" },
  { category: "Org", organization: "Church of Scientology Bogotá", city: "Bogotá", country: "Colombia" },
  { category: "Org", organization: "Church of Scientology Mexico", city: "Mexico City", country: "Mexico" },
  { category: "Org", organization: "Church of Scientology Buenos Aires", city: "Buenos Aires", country: "Argentina" },
  { category: "Org", organization: "Church of Scientology Caracas", city: "Caracas", country: "Venezuela" },
  { category: "Org", organization: "Church of Scientology Santiago", city: "Santiago", country: "Chile" },
  { category: "Org", organization: "Church of Scientology Lima", city: "Lima", country: "Peru" },
  { category: "Org", organization: "Church of Scientology São Paulo", city: "São Paulo", country: "Brazil" },
  { category: "Org", organization: "Church of Scientology Tokyo", city: "Tokyo", country: "Japan" },
  { category: "Org", organization: "Church of Scientology Taiwan", city: "Kaohsiung", country: "Taiwan" },
  { category: "Org", organization: "Church of Scientology Tel Aviv", city: "Tel Aviv", country: "Israel" },
  { category: "Org", organization: "Church of Scientology of Eastern Cape", city: "Gqeberha", country: "South Africa" },
  { category: "Org", organization: "Church of Scientology of Johannesburg", city: "Johannesburg", country: "South Africa" },
  { category: "Org", organization: "Church of Scientology of Johannesburg North", city: "Johannesburg", country: "South Africa" },
  { category: "Org", organization: "Church of Scientology of Pretoria", city: "Pretoria", country: "South Africa" },
  { category: "Org", organization: "Church of Scientology Cape Town", city: "Cape Town", country: "South Africa" },
  { category: "Org", organization: "Church of Scientology Durban", city: "Durban", country: "South Africa" },
  { category: "Org", organization: "Church of Scientology of Sydney", city: "Sydney, New South Wales", country: "Australia" },
  { category: "Org", organization: "Church of Scientology of Melbourne", city: "Melbourne, Victoria", country: "Australia" },
  { category: "Org", organization: "Church of Scientology Perth", city: "Perth, Western Australia", country: "Australia" },
  { category: "Org", organization: "Church of Scientology Brisbane", city: "Brisbane, Queensland", country: "Australia" },
  { category: "Org", organization: "Church of Scientology Adelaide", city: "Adelaide, South Australia", country: "Australia" },
  { category: "Org", organization: "Church of Scientology Canberra", city: "Canberra, Australian Capital Territory", country: "Australia" },
  { category: "Org", organization: "Church of Scientology Auckland", city: "Auckland", country: "New Zealand" }
];

function normalizeOrgTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type IndexedScientologyOrg = {
  aliases: string[];
  category: string;
  city: string;
  country: string;
  org: ScientologyOrg;
  organization: string;
  searchText: string;
};

const SCIENTOLOGY_ORG_RESULT_CACHE_LIMIT = 128;
const indexedScientologyOrgs: IndexedScientologyOrg[] = scientologyOrgs.map((org) => {
  const organization = normalizeOrgTerm(org.organization);
  const city = normalizeOrgTerm(org.city);
  const country = normalizeOrgTerm(org.country);
  const category = normalizeOrgTerm(org.category ?? "");
  const aliases = (org.aliases ?? []).map(normalizeOrgTerm);
  return {
    aliases,
    category,
    city,
    country,
    org,
    organization,
    searchText: [organization, city, country, category, ...aliases].join(" ")
  };
});
const scientologyOrgResultCache = new Map<string, ScientologyOrg[]>();

function scoreOrg(indexedOrg: IndexedScientologyOrg, query: string) {
  if (!query) return 0;

  const { aliases, category, city, country, organization, searchText } = indexedOrg;
  const terms = query.split(" ").filter(Boolean);

  return terms.reduce((score, term) => {
    if (aliases.some((alias) => alias === term || alias.replace(/\s+/g, "") === term)) return score + 25;
    if (organization === term || city === term || country === term || category === term) return score + 20;
    if (organization.startsWith(term)) return score + 12;
    if (city.startsWith(term)) return score + 10;
    if (aliases.some((alias) => alias.startsWith(term))) return score + 10;
    if (country.startsWith(term)) return score + 6;
    if (organization.includes(term)) return score + 5;
    if (city.includes(term)) return score + 4;
    if (searchText.includes(term)) return score + 2;
    return score - 8;
  }, 0);
}

export function formatScientologyOrg(org: ScientologyOrg) {
  const category = org.category ? ` (${org.category})` : "";
  return `${org.organization} - ${org.city}, ${org.country}${category}`;
}

export function findScientologyOrgs(query: string, limit = 8) {
  const normalizedQuery = normalizeOrgTerm(query);
  const cleanLimit = Math.min(Math.max(limit, 1), 20);

  if (!normalizedQuery) {
    return scientologyOrgs.slice(0, cleanLimit);
  }

  const cacheKey = `${normalizedQuery}:${cleanLimit}`;
  const cached = scientologyOrgResultCache.get(cacheKey);
  if (cached) {
    scientologyOrgResultCache.delete(cacheKey);
    scientologyOrgResultCache.set(cacheKey, cached);
    return [...cached];
  }

  const matches = indexedScientologyOrgs
    .map((indexedOrg) => ({ org: indexedOrg.org, score: scoreOrg(indexedOrg, normalizedQuery) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.org.organization.localeCompare(right.org.organization))
    .slice(0, cleanLimit)
    .map((result) => result.org);

  scientologyOrgResultCache.set(cacheKey, matches);
  if (scientologyOrgResultCache.size > SCIENTOLOGY_ORG_RESULT_CACHE_LIMIT) {
    const oldestKey = scientologyOrgResultCache.keys().next().value;
    if (oldestKey) scientologyOrgResultCache.delete(oldestKey);
  }
  return [...matches];
}
