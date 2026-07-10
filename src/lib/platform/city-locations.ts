export type CityLocationSuggestion = {
  city: string;
  country: string;
  label: string;
  region: string;
};

type CityLocationRecord = {
  aliases?: string[];
  city: string;
  country?: string;
  populationRank: number;
  region: string;
};

const CITY_LOCATIONS: CityLocationRecord[] = [
  { city: "New York", region: "NY", populationRank: 1 },
  { city: "Los Angeles", region: "CA", populationRank: 2, aliases: ["LA"] },
  { city: "Chicago", region: "IL", populationRank: 3 },
  { city: "Houston", region: "TX", populationRank: 4 },
  { city: "Phoenix", region: "AZ", populationRank: 5 },
  { city: "Philadelphia", region: "PA", populationRank: 6 },
  { city: "San Antonio", region: "TX", populationRank: 7 },
  { city: "San Diego", region: "CA", populationRank: 8 },
  { city: "Dallas", region: "TX", populationRank: 9 },
  { city: "Jacksonville", region: "FL", populationRank: 10 },
  { city: "Austin", region: "TX", populationRank: 11 },
  { city: "Fort Worth", region: "TX", populationRank: 12 },
  { city: "San Jose", region: "CA", populationRank: 13 },
  { city: "Columbus", region: "OH", populationRank: 14 },
  { city: "Charlotte", region: "NC", populationRank: 15 },
  { city: "Indianapolis", region: "IN", populationRank: 16 },
  { city: "San Francisco", region: "CA", populationRank: 17, aliases: ["SF"] },
  { city: "Seattle", region: "WA", populationRank: 18 },
  { city: "Denver", region: "CO", populationRank: 19 },
  { city: "Oklahoma City", region: "OK", populationRank: 20 },
  { city: "Nashville", region: "TN", populationRank: 21 },
  { city: "Washington", region: "DC", populationRank: 22, aliases: ["Washington DC", "DC"] },
  { city: "El Paso", region: "TX", populationRank: 23 },
  { city: "Las Vegas", region: "NV", populationRank: 24 },
  { city: "Boston", region: "MA", populationRank: 25 },
  { city: "Detroit", region: "MI", populationRank: 26 },
  { city: "Portland", region: "OR", populationRank: 27 },
  { city: "Louisville", region: "KY", populationRank: 28 },
  { city: "Memphis", region: "TN", populationRank: 29 },
  { city: "Baltimore", region: "MD", populationRank: 30 },
  { city: "Milwaukee", region: "WI", populationRank: 31 },
  { city: "Albuquerque", region: "NM", populationRank: 32 },
  { city: "Tucson", region: "AZ", populationRank: 33 },
  { city: "Fresno", region: "CA", populationRank: 34 },
  { city: "Sacramento", region: "CA", populationRank: 35 },
  { city: "Mesa", region: "AZ", populationRank: 36 },
  { city: "Kansas City", region: "MO", populationRank: 37 },
  { city: "Atlanta", region: "GA", populationRank: 38 },
  { city: "Omaha", region: "NE", populationRank: 39 },
  { city: "Colorado Springs", region: "CO", populationRank: 40 },
  { city: "Raleigh", region: "NC", populationRank: 41 },
  { city: "Long Beach", region: "CA", populationRank: 42 },
  { city: "Virginia Beach", region: "VA", populationRank: 43 },
  { city: "Miami", region: "FL", populationRank: 44 },
  { city: "Oakland", region: "CA", populationRank: 45 },
  { city: "Minneapolis", region: "MN", populationRank: 46 },
  { city: "Tulsa", region: "OK", populationRank: 47 },
  { city: "Bakersfield", region: "CA", populationRank: 48 },
  { city: "Wichita", region: "KS", populationRank: 49 },
  { city: "Arlington", region: "TX", populationRank: 50 },
  { city: "Aurora", region: "CO", populationRank: 51 },
  { city: "Tampa", region: "FL", populationRank: 52 },
  { city: "New Orleans", region: "LA", populationRank: 53 },
  { city: "Cleveland", region: "OH", populationRank: 54 },
  { city: "Honolulu", region: "HI", populationRank: 55 },
  { city: "Anaheim", region: "CA", populationRank: 56 },
  { city: "Lexington", region: "KY", populationRank: 57 },
  { city: "Stockton", region: "CA", populationRank: 58 },
  { city: "Corpus Christi", region: "TX", populationRank: 59 },
  { city: "Henderson", region: "NV", populationRank: 60 },
  { city: "Riverside", region: "CA", populationRank: 61 },
  { city: "Newark", region: "NJ", populationRank: 62 },
  { city: "Saint Paul", region: "MN", populationRank: 63, aliases: ["St Paul", "St. Paul"] },
  { city: "Santa Ana", region: "CA", populationRank: 64 },
  { city: "Cincinnati", region: "OH", populationRank: 65 },
  { city: "Irvine", region: "CA", populationRank: 66 },
  { city: "Orlando", region: "FL", populationRank: 67 },
  { city: "Pittsburgh", region: "PA", populationRank: 68 },
  { city: "St. Louis", region: "MO", populationRank: 69, aliases: ["Saint Louis", "St Louis"] },
  { city: "Greensboro", region: "NC", populationRank: 70 },
  { city: "Jersey City", region: "NJ", populationRank: 71 },
  { city: "Anchorage", region: "AK", populationRank: 72 },
  { city: "Lincoln", region: "NE", populationRank: 73 },
  { city: "Plano", region: "TX", populationRank: 74 },
  { city: "Durham", region: "NC", populationRank: 75 },
  { city: "Buffalo", region: "NY", populationRank: 76 },
  { city: "Chandler", region: "AZ", populationRank: 77 },
  { city: "Chula Vista", region: "CA", populationRank: 78 },
  { city: "Toledo", region: "OH", populationRank: 79 },
  { city: "Madison", region: "WI", populationRank: 80 },
  { city: "Gilbert", region: "AZ", populationRank: 81 },
  { city: "Reno", region: "NV", populationRank: 82 },
  { city: "Fort Wayne", region: "IN", populationRank: 83 },
  { city: "North Las Vegas", region: "NV", populationRank: 84 },
  { city: "St. Petersburg", region: "FL", populationRank: 85, aliases: ["Saint Petersburg", "St Petersburg"] },
  { city: "Lubbock", region: "TX", populationRank: 86 },
  { city: "Irving", region: "TX", populationRank: 87 },
  { city: "Laredo", region: "TX", populationRank: 88 },
  { city: "Winston-Salem", region: "NC", populationRank: 89 },
  { city: "Chesapeake", region: "VA", populationRank: 90 },
  { city: "Glendale", region: "AZ", populationRank: 91 },
  { city: "Garland", region: "TX", populationRank: 92 },
  { city: "Scottsdale", region: "AZ", populationRank: 93 },
  { city: "Norfolk", region: "VA", populationRank: 94 },
  { city: "Boise", region: "ID", populationRank: 95 },
  { city: "Spokane", region: "WA", populationRank: 96 },
  { city: "Richmond", region: "VA", populationRank: 97 },
  { city: "Fremont", region: "CA", populationRank: 98 },
  { city: "Huntsville", region: "AL", populationRank: 99 },
  { city: "Frisco", region: "TX", populationRank: 100 },
  { city: "Cape Coral", region: "FL", populationRank: 101 },
  { city: "Santa Clarita", region: "CA", populationRank: 102 },
  { city: "San Bernardino", region: "CA", populationRank: 103 },
  { city: "Tacoma", region: "WA", populationRank: 104 },
  { city: "Hialeah", region: "FL", populationRank: 105 },
  { city: "Modesto", region: "CA", populationRank: 106 },
  { city: "McKinney", region: "TX", populationRank: 107 },
  { city: "Fontana", region: "CA", populationRank: 108 },
  { city: "Des Moines", region: "IA", populationRank: 109 },
  { city: "Fayetteville", region: "NC", populationRank: 110 },
  { city: "Birmingham", region: "AL", populationRank: 111 },
  { city: "Oxnard", region: "CA", populationRank: 112 },
  { city: "Rochester", region: "NY", populationRank: 113 },
  { city: "Port St. Lucie", region: "FL", populationRank: 114, aliases: ["Port Saint Lucie", "Port St Lucie"] },
  { city: "Grand Rapids", region: "MI", populationRank: 115 },
  { city: "Salt Lake City", region: "UT", populationRank: 116 },
  { city: "Yonkers", region: "NY", populationRank: 117 },
  { city: "Amarillo", region: "TX", populationRank: 118 },
  { city: "Huntington Beach", region: "CA", populationRank: 119 },
  { city: "Little Rock", region: "AR", populationRank: 120 },
  { city: "Augusta", region: "GA", populationRank: 121 },
  { city: "Tallahassee", region: "FL", populationRank: 122 },
  { city: "Overland Park", region: "KS", populationRank: 123 },
  { city: "Tempe", region: "AZ", populationRank: 124 },
  { city: "Grand Prairie", region: "TX", populationRank: 125 },
  { city: "Knoxville", region: "TN", populationRank: 126 },
  { city: "Brownsville", region: "TX", populationRank: 127 },
  { city: "Worcester", region: "MA", populationRank: 128 },
  { city: "Newport News", region: "VA", populationRank: 129 },
  { city: "Santa Rosa", region: "CA", populationRank: 130 },
  { city: "Peoria", region: "AZ", populationRank: 131 },
  { city: "Providence", region: "RI", populationRank: 132 },
  { city: "Fort Lauderdale", region: "FL", populationRank: 133 },
  { city: "Chattanooga", region: "TN", populationRank: 134 },
  { city: "Mobile", region: "AL", populationRank: 135 },
  { city: "Sioux Falls", region: "SD", populationRank: 136 },
  { city: "Cary", region: "NC", populationRank: 137 },
  { city: "Montgomery", region: "AL", populationRank: 138 },
  { city: "Shreveport", region: "LA", populationRank: 139 },
  { city: "Moreno Valley", region: "CA", populationRank: 140 },
  { city: "Akron", region: "OH", populationRank: 141 },
  { city: "Aurora", region: "IL", populationRank: 142 },
  { city: "Oceanside", region: "CA", populationRank: 143 },
  { city: "Elk Grove", region: "CA", populationRank: 144 },
  { city: "Salem", region: "OR", populationRank: 145 },
  { city: "Garden Grove", region: "CA", populationRank: 146 },
  { city: "Lancaster", region: "CA", populationRank: 147 },
  { city: "Corona", region: "CA", populationRank: 148 },
  { city: "Eugene", region: "OR", populationRank: 149 },
  { city: "Palmdale", region: "CA", populationRank: 150 },
  { city: "Salinas", region: "CA", populationRank: 151 },
  { city: "Springfield", region: "MO", populationRank: 152 },
  { city: "Pasadena", region: "CA", populationRank: 153 },
  { city: "Hayward", region: "CA", populationRank: 154 },
  { city: "Pomona", region: "CA", populationRank: 155 },
  { city: "Escondido", region: "CA", populationRank: 156 },
  { city: "Sunnyvale", region: "CA", populationRank: 157 },
  { city: "Torrance", region: "CA", populationRank: 158 },
  { city: "Fullerton", region: "CA", populationRank: 159 },
  { city: "Orange", region: "CA", populationRank: 160 },
  { city: "Simi Valley", region: "CA", populationRank: 161 },
  { city: "Thousand Oaks", region: "CA", populationRank: 162 },
  { city: "Vallejo", region: "CA", populationRank: 163 },
  { city: "Concord", region: "CA", populationRank: 164 },
  { city: "Berkeley", region: "CA", populationRank: 165 },
  { city: "Fairfield", region: "CA", populationRank: 166 },
  { city: "Rialto", region: "CA", populationRank: 167 },
  { city: "Costa Mesa", region: "CA", populationRank: 168 },
  { city: "Ventura", region: "CA", populationRank: 169 },
  { city: "West Covina", region: "CA", populationRank: 170 },
  { city: "Murrieta", region: "CA", populationRank: 171 },
  { city: "Norwalk", region: "CA", populationRank: 172 },
  { city: "Burbank", region: "CA", populationRank: 173 },
  { city: "Carlsbad", region: "CA", populationRank: 174 },
  { city: "El Cajon", region: "CA", populationRank: 175 },
  { city: "San Mateo", region: "CA", populationRank: 176 },
  { city: "Daly City", region: "CA", populationRank: 177 },
  { city: "Santa Monica", region: "CA", populationRank: 178 },
  { city: "Inglewood", region: "CA", populationRank: 179 },
  { city: "Santa Barbara", region: "CA", populationRank: 180 },
  { city: "Monterey", region: "CA", populationRank: 181 },
  { city: "San Luis Obispo", region: "CA", populationRank: 182 },
  { city: "Palm Springs", region: "CA", populationRank: 183 },
  { city: "Albany", region: "NY", populationRank: 184 },
  { city: "Trenton", region: "NJ", populationRank: 185 },
  { city: "Hartford", region: "CT", populationRank: 186 },
  { city: "New Haven", region: "CT", populationRank: 187 },
  { city: "Manchester", region: "NH", populationRank: 188 },
  { city: "Burlington", region: "VT", populationRank: 189 },
  { city: "Portland", region: "ME", populationRank: 190 },
  { city: "Toronto", region: "ON", country: "Canada", populationRank: 191 },
  { city: "Vancouver", region: "BC", country: "Canada", populationRank: 192 },
  { city: "Montreal", region: "QC", country: "Canada", populationRank: 193 },
  { city: "Calgary", region: "AB", country: "Canada", populationRank: 194 },
  { city: "Ottawa", region: "ON", country: "Canada", populationRank: 195 },
  { city: "Edmonton", region: "AB", country: "Canada", populationRank: 196 },
  { city: "Winnipeg", region: "MB", country: "Canada", populationRank: 197 },
  { city: "Quebec City", region: "QC", country: "Canada", populationRank: 198 },
  { city: "London", region: "England", country: "United Kingdom", populationRank: 199 },
  { city: "Sydney", region: "NSW", country: "Australia", populationRank: 200 },
  { city: "Melbourne", region: "VIC", country: "Australia", populationRank: 201 }
];

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

function cityRecordFromValue(value: string, index: number): CityLocationRecord | null {
  const cleanValue = value.replace(/\s+/g, " ").trim();
  if (cleanValue.length < 2 || cleanValue.length > 120) return null;
  if (/\d/.test(cleanValue)) return null;

  const parts = cleanValue
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const city = parts[0];
  if (!city || city.length < 2) return null;

  return {
    city,
    country: parts.length > 2 ? parts.slice(2).join(", ") : undefined,
    populationRank: index + 1,
    region: parts[1] ?? ""
  };
}

function scoreRecord(record: CityLocationRecord, query: string) {
  const country = record.country ?? "United States";
  const label = `${record.city}${record.region ? `, ${record.region}` : ""}${country === "United States" ? "" : `, ${country}`}`;
  const searchableValues = [record.city, record.region, label, country, ...(record.aliases ?? [])];
  const normalizedQuery = normalizeSearch(query);
  const compactQuery = compact(query);

  if (normalizedQuery.length < 2) return null;

  let bestScore: number | null = null;
  for (const value of searchableValues) {
    const normalizedValue = normalizeSearch(value);
    const compactValue = compact(value);
    let score: number | null = null;

    if (normalizedValue === normalizedQuery || compactValue === compactQuery) {
      score = 0;
    } else if (normalizedValue.startsWith(normalizedQuery) || compactValue.startsWith(compactQuery)) {
      score = 5;
    } else if (normalizedValue.includes(normalizedQuery) || compactValue.includes(compactQuery)) {
      score = 15 + normalizedValue.indexOf(normalizedQuery);
    }

    if (score !== null) {
      bestScore = bestScore === null ? score : Math.min(bestScore, score);
    }
  }

  if (bestScore === null) return null;
  return bestScore * 1000 + record.populationRank;
}

export function searchCityLocations(query: string, limit = 8, extraCityValues: string[] = []): CityLocationSuggestion[] {
  const cleanLimit = Math.min(Math.max(limit, 1), 12);
  const records = [
    ...extraCityValues
      .map((value, index) => cityRecordFromValue(value, index))
      .filter((record): record is CityLocationRecord => Boolean(record)),
    ...CITY_LOCATIONS
  ];
  const seen = new Set<string>();
  const suggestions: CityLocationSuggestion[] = [];

  for (const { record } of records
    .map((record) => ({ record, score: scoreRecord(record, query) }))
    .filter((entry): entry is { record: CityLocationRecord; score: number } => entry.score !== null)
    .sort((left, right) => left.score - right.score)
  ) {
    const country = record.country ?? "United States";
    const label = `${record.city}${record.region ? `, ${record.region}` : ""}${country === "United States" ? "" : `, ${country}`}`;
    const key = compact(label);
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      city: record.city,
      country,
      label,
      region: record.region
    });
    if (suggestions.length >= cleanLimit) break;
  }

  return suggestions;
}
