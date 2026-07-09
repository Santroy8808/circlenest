export type ScientologyOrg = {
  organization: string;
  city: string;
  country: string;
};

export const scientologyOrgs: ScientologyOrg[] = [
  { organization: "Church of Scientology of Atlanta", city: "Sandy Springs, Georgia", country: "USA" },
  { organization: "Church of Scientology of Austin", city: "Austin, Texas", country: "USA" },
  { organization: "Church of Scientology of Chicago", city: "Chicago, Illinois", country: "USA" },
  { organization: "Church of Scientology Dallas", city: "Irving (Dallas), Texas", country: "USA" },
  { organization: "Church of Scientology of Harlem", city: "New York, New York", country: "USA" },
  { organization: "Church of Scientology of Los Angeles", city: "Los Angeles, California", country: "USA" },
  { organization: "Church of Scientology of Miami", city: "Miami, Florida", country: "USA" },
  { organization: "Church of Scientology of New York", city: "New York, New York", country: "USA" },
  { organization: "Church of Scientology of Orlando", city: "Orlando, Florida", country: "USA" },
  { organization: "Church of Scientology of Pasadena", city: "Pasadena, California", country: "USA" },
  { organization: "Church of Scientology of Puerto Rico", city: "San Juan, Puerto Rico", country: "USA" },
  { organization: "Church of Scientology of Salt Lake City", city: "Salt Lake City, Utah", country: "USA" },
  { organization: "Church of Scientology of San Diego", city: "San Diego, California", country: "USA" },
  { organization: "Church of Scientology of San Francisco", city: "San Francisco, California", country: "USA" },
  { organization: "Church of Scientology of Silicon Valley", city: "Mountain View, California", country: "USA" },
  { organization: "Church of Scientology of the Valley", city: "North Hollywood, California", country: "USA" },
  { organization: "Church of Scientology of Washington State", city: "Seattle, Washington", country: "USA" },
  { organization: "Founding Church of Scientology", city: "Washington, D.C.", country: "USA" },
  { organization: "Church of Scientology Celebrity Centre International", city: "Los Angeles, California", country: "USA" },
  { organization: "Church of Scientology & Celebrity Centre Nashville", city: "Nashville, Tennessee", country: "USA" },
  { organization: "Church of Scientology & Celebrity Centre Las Vegas", city: "Las Vegas, Nevada", country: "USA" },
  { organization: "Church of Scientology of Québec", city: "Québec City, Québec", country: "Canada" },
  { organization: "Church of Scientology of Cambridge", city: "Cambridge, Ontario", country: "Canada" },
  { organization: "Church of Scientology Amsterdam", city: "Amsterdam", country: "Netherlands" },
  { organization: "Churches of Scientology for Europe", city: "Brussels", country: "Belgium" },
  { organization: "Church of Scientology Basel", city: "Basel", country: "Switzerland" },
  { organization: "Church of Scientology Berlin", city: "Berlin", country: "Germany" },
  { organization: "Church of Scientology Denmark", city: "Copenhagen", country: "Denmark" },
  { organization: "Church of Scientology Hamburg", city: "Hamburg", country: "Germany" },
  { organization: "Church of Scientology Budapest", city: "Budapest", country: "Hungary" },
  { organization: "Church of Scientology of London", city: "London", country: "United Kingdom" },
  { organization: "Church of Scientology of Birmingham", city: "Birmingham", country: "United Kingdom" },
  { organization: "Church of Scientology & Community Centre of Dublin", city: "Dublin", country: "Ireland" },
  { organization: "Church of Scientology of Madrid", city: "Madrid", country: "Spain" },
  { organization: "Church of Scientology of Milano", city: "Milan", country: "Italy" },
  { organization: "Church of Scientology of Roma", city: "Rome", country: "Italy" },
  { organization: "Church of Scientology of Padova", city: "Padova", country: "Italy" },
  { organization: "Church of Scientology of Malmö", city: "Malmö", country: "Sweden" },
  { organization: "Church of Scientology & Celebrity Centre of Greater Paris", city: "Saint-Denis (Paris)", country: "France" },
  { organization: "Church of Scientology Bogotá", city: "Bogotá", country: "Colombia" },
  { organization: "Church of Scientology Mexico", city: "Mexico City", country: "Mexico" },
  { organization: "Church of Scientology of Eastern Cape", city: "Gqeberha", country: "South Africa" },
  { organization: "Church of Scientology of Johannesburg", city: "Johannesburg", country: "South Africa" },
  { organization: "Church of Scientology of Johannesburg North", city: "Johannesburg", country: "South Africa" },
  { organization: "Church of Scientology of Pretoria", city: "Pretoria", country: "South Africa" },
  { organization: "Church of Scientology of Melbourne", city: "Melbourne", country: "Australia" }
];

function normalizeOrgTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreOrg(org: ScientologyOrg, rawQuery: string) {
  const query = normalizeOrgTerm(rawQuery);
  if (!query) return 0;

  const organization = normalizeOrgTerm(org.organization);
  const city = normalizeOrgTerm(org.city);
  const country = normalizeOrgTerm(org.country);
  const searchText = `${organization} ${city} ${country}`;
  const terms = query.split(" ").filter(Boolean);

  return terms.reduce((score, term) => {
    if (organization === term || city === term || country === term) return score + 20;
    if (organization.startsWith(term)) return score + 12;
    if (city.startsWith(term)) return score + 10;
    if (country.startsWith(term)) return score + 6;
    if (organization.includes(term)) return score + 5;
    if (city.includes(term)) return score + 4;
    if (searchText.includes(term)) return score + 2;
    return score - 8;
  }, 0);
}

export function formatScientologyOrg(org: ScientologyOrg) {
  return `${org.organization} - ${org.city}, ${org.country}`;
}

export function findScientologyOrgs(query: string, limit = 8) {
  const normalizedQuery = normalizeOrgTerm(query);

  if (!normalizedQuery) {
    return scientologyOrgs.slice(0, limit);
  }

  return scientologyOrgs
    .map((org) => ({ org, score: scoreOrg(org, normalizedQuery) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.org.organization.localeCompare(right.org.organization))
    .slice(0, limit)
    .map((result) => result.org);
}
