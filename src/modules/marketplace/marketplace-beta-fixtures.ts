import { MARKETPLACE_TAXONOMY } from "./marketplace-taxonomy";
import type { MarketplaceListingKind } from "./marketplace.contracts";

export const MARKETPLACE_BETA_TAG = "beta_test";
export const MARKETPLACE_BETA_LISTINGS_PER_CATEGORY = 72;

type BetaLocation = {
  city: string;
  countryCode: string;
  currency: string;
  priceFactor: number;
  region: string;
};

export type MarketplaceBetaFixture = {
  attributes: Record<string, unknown>;
  category: string;
  city: string;
  condition: string | null;
  countryCode: string;
  createdAt: Date;
  currency: string;
  deliveryAvailable: boolean;
  description: string;
  imageUrl: string;
  intent: "OFFER" | "WANTED";
  kind: MarketplaceListingKind;
  priceCents: number | null;
  priceMaxCents: number | null;
  priceMinCents: number | null;
  priceType: "FIXED" | "NEGOTIABLE" | "RANGE" | "FREE" | "QUOTE" | "CONTACT";
  publishedAt: Date;
  region: string;
  remote: boolean;
  slug: string;
  subcategory: string | null;
  summary: string;
  title: string;
};

const LOCATIONS: readonly BetaLocation[] = [
  { city: "Clearwater", region: "Florida", countryCode: "US", currency: "USD", priceFactor: 1 },
  { city: "Los Angeles", region: "California", countryCode: "US", currency: "USD", priceFactor: 1.08 },
  { city: "Portland", region: "Oregon", countryCode: "US", currency: "USD", priceFactor: 1.03 },
  { city: "Austin", region: "Texas", countryCode: "US", currency: "USD", priceFactor: 0.98 },
  { city: "Denver", region: "Colorado", countryCode: "US", currency: "USD", priceFactor: 1.04 },
  { city: "Seattle", region: "Washington", countryCode: "US", currency: "USD", priceFactor: 1.12 },
  { city: "Atlanta", region: "Georgia", countryCode: "US", currency: "USD", priceFactor: 0.94 },
  { city: "Phoenix", region: "Arizona", countryCode: "US", currency: "USD", priceFactor: 0.96 },
  { city: "New York", region: "New York", countryCode: "US", currency: "USD", priceFactor: 1.3 },
  { city: "Chicago", region: "Illinois", countryCode: "US", currency: "USD", priceFactor: 1.02 },
  { city: "Johannesburg", region: "Gauteng", countryCode: "ZA", currency: "ZAR", priceFactor: 18.2 },
  { city: "Pretoria", region: "Gauteng", countryCode: "ZA", currency: "ZAR", priceFactor: 17.5 },
  { city: "Cape Town", region: "Western Cape", countryCode: "ZA", currency: "ZAR", priceFactor: 19 },
  { city: "Durban", region: "KwaZulu-Natal", countryCode: "ZA", currency: "ZAR", priceFactor: 17.2 },
  { city: "London", region: "England", countryCode: "GB", currency: "GBP", priceFactor: 0.84 },
  { city: "East Grinstead", region: "England", countryCode: "GB", currency: "GBP", priceFactor: 0.79 },
  { city: "Manchester", region: "England", countryCode: "GB", currency: "GBP", priceFactor: 0.76 },
  { city: "Toronto", region: "Ontario", countryCode: "CA", currency: "CAD", priceFactor: 1.42 },
  { city: "Vancouver", region: "British Columbia", countryCode: "CA", currency: "CAD", priceFactor: 1.48 },
  { city: "Sydney", region: "New South Wales", countryCode: "AU", currency: "AUD", priceFactor: 1.55 },
  { city: "Melbourne", region: "Victoria", countryCode: "AU", currency: "AUD", priceFactor: 1.49 },
];

const QUALIFIERS = ["Well-kept", "Updated", "Quality", "Practical", "Ready-to-use", "Clean", "Reliable", "Locally available", "Excellent", "Gently used", "Professional", "Versatile"] as const;
const COMPANIES = ["Brightline Works", "Northstar Services", "Clearpath Partners", "Summit & Field", "Open Road Supply", "Harborstone Group", "Arc & Oak", "Goodway Solutions", "Civic Thread", "Bluebird Workshop", "Evergreen Operations", "Waypoint Collective"] as const;
const CONDITIONS = ["Like new", "Excellent", "Good", "Very good", "Refurbished", "New"] as const;

const GOODS_NOUNS: Record<string, readonly string[]> = {
  "Furniture & Decor": ["solid wood cabinet", "modular shelving set", "upholstered accent chair", "dining table set", "storage console", "office desk"],
  Electronics: ["laptop workstation", "wireless audio set", "mirrorless camera kit", "smartphone bundle", "gaming monitor", "home theater receiver"],
  Appliances: ["countertop mixer", "front-load washer", "compact refrigerator", "air purifier", "espresso machine", "robot vacuum"],
  Clothing: ["tailored jacket", "linen dress", "workwear bundle", "vintage denim set", "formal suit", "children's clothing lot"],
  "Shoes & Accessories": ["leather travel bag", "walking shoes", "structured handbag", "handmade belt", "classic sunglasses", "weekend tote"],
  "Jewelry & Watches": ["sterling silver necklace", "automatic wristwatch", "handmade earrings", "vintage brooch", "gold pendant", "jewelry making set"],
  "Home & Garden": ["ceramic cookware set", "raised garden bed", "linen bedding set", "indoor plant collection", "brass floor lamp", "outdoor planter set"],
  "Tools & Equipment": ["cordless drill set", "mechanic tool chest", "portable workbench", "electric lawn mower", "finish nailer kit", "shop vacuum"],
  "Books & Media": ["hardcover book collection", "educational reference set", "vinyl record bundle", "classic film collection", "rare magazine lot", "music score library"],
  "Art & Collectibles": ["framed original painting", "signed photography print", "ceramic sculpture", "vintage poster", "collectible model set", "mid-century wall art"],
  "Handmade & Vintage": ["hand-thrown serving set", "personalized keepsake box", "vintage kitchen set", "upcycled side table", "handwoven wall hanging", "custom leather journal"],
  "Craft Supplies": ["premium fabric bundle", "watercolor supply set", "jewelry findings collection", "hardwood turning blanks", "scrapbook paper lot", "natural yarn bundle"],
  "Musical Instruments": ["acoustic guitar", "digital stage piano", "five-piece drum kit", "student violin", "powered speaker pair", "studio microphone bundle"],
  "Sports & Outdoors": ["adjustable weight set", "four-person tent", "mountain bike gear set", "inflatable paddleboard", "golf club set", "camp kitchen kit"],
  "Kids & Baby": ["convertible stroller", "wooden toy set", "nursery dresser", "children's desk", "baby carrier", "school supply bundle"],
  "Health & Beauty": ["professional hair dryer", "skin care set", "massage table", "salon chair", "fitness recovery kit", "personal care bundle"],
  "Pet Supplies": ["large pet crate", "cat climbing tower", "aquarium setup", "dog travel kit", "bird habitat", "grooming supply set"],
  "Office & Business": ["ergonomic office chair", "retail display set", "commercial prep table", "shipping station bundle", "locking file cabinet", "conference room table"],
  "Event & Wedding": ["event lighting set", "wedding table decor", "portable backdrop", "serving ware collection", "custom sign set", "formal chair cover set"],
  "Free & Trade": ["moving box bundle", "garden stone lot", "assorted shelving", "home repair materials", "office supply box", "workshop offcuts"],
  General: ["useful household bundle", "organized storage set", "weekend project supplies", "quality mixed lot", "home essentials package", "practical starter set"],
  Other: ["specialty equipment set", "unique household item", "useful project bundle", "hard-to-find accessory", "quality miscellaneous lot", "compact utility set"],
};

const VEHICLES_BY_CATEGORY: Record<string, readonly (readonly [string, string])[]> = {
  Cars: [["Toyota", "Corolla"], ["Honda", "Civic"], ["Volkswagen", "Golf"], ["Mazda", "Mazda3"], ["Hyundai", "Elantra"], ["Subaru", "Legacy"]],
  Trucks: [["Ford", "F-150"], ["Chevrolet", "Silverado"], ["Toyota", "Tacoma"], ["Nissan", "Frontier"], ["Ram", "1500"], ["GMC", "Sierra"]],
  "SUVs & Crossovers": [["Honda", "CR-V"], ["Subaru", "Outback"], ["Mazda", "CX-5"], ["Hyundai", "Tucson"], ["Kia", "Sportage"], ["Toyota", "RAV4"]],
  Vans: [["Ford", "Transit"], ["Mercedes-Benz", "Sprinter"], ["Honda", "Odyssey"], ["Toyota", "Sienna"], ["Ram", "ProMaster"], ["Volkswagen", "Transporter"]],
  Motorcycles: [["Yamaha", "MT-07"], ["Honda", "Rebel 500"], ["BMW", "R 1250 GS"], ["Kawasaki", "Ninja 650"], ["Suzuki", "V-Strom 650"], ["Triumph", "Bonneville"]],
  "Commercial Vehicles": [["Isuzu", "NPR"], ["Ford", "E-450"], ["Freightliner", "M2"], ["Hino", "195"], ["Ram", "ProMaster 3500"], ["Mercedes-Benz", "Sprinter 3500"]],
};

function vehicleForCategory(category: string, index: number) {
  return pick(VEHICLES_BY_CATEGORY[category] ?? VEHICLES_BY_CATEGORY.Cars, index);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function pick<T>(values: readonly T[], index: number) {
  return values[index % values.length];
}

function priced(baseCents: number, location: BetaLocation, index: number) {
  const variation = 0.82 + (index % 9) * 0.045;
  return Math.round((baseCents * location.priceFactor * variation) / 100) * 100;
}

function listingPrice(kind: MarketplaceListingKind, location: BetaLocation, index: number, category: string) {
  if (kind === "AUDITOR") return { priceType: "CONTACT" as const, priceCents: null, priceMinCents: null, priceMaxCents: null };
  if (kind === "JOB") {
    const minimum = priced(4_800_000 + (index % 7) * 550_000, location, index);
    return { priceType: "RANGE" as const, priceCents: null, priceMinCents: minimum, priceMaxCents: Math.round(minimum * 1.28 / 100) * 100 };
  }
  if (kind === "SERVICE") return { priceType: index % 4 === 0 ? "QUOTE" as const : "FIXED" as const, priceCents: index % 4 === 0 ? null : priced(7_500 + (index % 8) * 3_500, location, index), priceMinCents: null, priceMaxCents: null };
  if (kind === "RENTAL") return { priceType: "FIXED" as const, priceCents: priced(95_000 + (index % 10) * 18_000, location, index), priceMinCents: null, priceMaxCents: null };
  if (kind === "VEHICLE") return { priceType: "NEGOTIABLE" as const, priceCents: priced(650_000 + (index % 12) * 185_000, location, index), priceMinCents: null, priceMaxCents: null };
  if (category === "Free & Trade" && index % 3 === 0) return { priceType: "FREE" as const, priceCents: null, priceMinCents: null, priceMaxCents: null };
  return { priceType: index % 5 === 0 ? "NEGOTIABLE" as const : "FIXED" as const, priceCents: priced(2_500 + (index % 14) * 4_200, location, index), priceMinCents: null, priceMaxCents: null };
}

function goodsTitle(category: string, subcategory: string | null, index: number) {
  const noun = pick(GOODS_NOUNS[category] ?? GOODS_NOUNS.Other, index);
  return `${pick(QUALIFIERS, index)} ${noun}${subcategory && index % 3 === 0 ? ` - ${subcategory}` : ""}`;
}

function vehicleTitle(category: string, index: number) {
  const [make, model] = vehicleForCategory(category, index);
  const year = 2013 + (index % 13);
  if (category === "Bicycles") return `${year} ${pick(["Trek", "Specialized", "Giant", "Cannondale"], index)} ${pick(["road bike", "mountain bike", "commuter bike", "electric bike"], index)}`;
  if (category === "Boats & Watercraft") return `${year} ${pick(["Bayliner", "Yamaha", "Sea Ray", "Hobie"], index)} ${pick(["runabout", "sailboat", "personal watercraft", "kayak package"], index)}`;
  if (category === "RVs & Campers") return `${year} ${pick(["Winnebago", "Airstream", "Jayco", "Forest River"], index)} ${pick(["travel trailer", "motorhome", "camper", "fifth wheel"], index)}`;
  if (category === "Parts & Accessories") return `${pick(QUALIFIERS, index)} ${pick(["wheel and tire set", "roof rack system", "towing package", "replacement engine", "seat set", "diagnostic tool"], index)}`;
  return `${year} ${make} ${model}`;
}

function rentalTitle(category: string, subcategory: string | null, location: BetaLocation, index: number) {
  if (category === "Housing Wanted") return `${pick(["Quiet professional", "Small family", "Working couple", "Graduate student"], index)} seeking ${subcategory?.toLowerCase() ?? "housing"} in ${location.city}`;
  if (category === "Storage & Parking") return `${pick(QUALIFIERS, index)} ${subcategory?.toLowerCase() ?? "storage space"} near ${location.city}`;
  const beds = 1 + (index % 4);
  return `${beds}-bedroom ${subcategory?.toLowerCase() ?? category.toLowerCase()} in ${location.city}`;
}

function serviceTitle(category: string, subcategory: string | null, location: BetaLocation, index: number) {
  const subject = subcategory ?? category;
  return `${pick(["Reliable", "Experienced", "Responsive", "Local", "Professional", "Detail-focused"], index)} ${subject.toLowerCase()} in ${location.city}`;
}

function jobTitle(subcategory: string | null, location: BetaLocation, index: number) {
  const level = pick(["Coordinator", "Specialist", "Manager", "Associate", "Lead", "Assistant"], index);
  const discipline = subcategory ?? "Operations";
  return `${discipline} ${level} - ${location.city}`;
}

function auditorTitle(category: string, location: BetaLocation, index: number) {
  if (category === "Auditing Wanted") return `${pick(["Seeking", "Looking for", "Need"], index)} ${pick(["local auditing", "introductory service guidance", "traveling auditor", "schedule consultation"], index)} in ${location.city}`;
  return `${pick(["Clear Path", "Uplift", "Forward", "Affinity", "Progress", "Cause Point"], index)} ${category.replace(/s$/, "")} - ${location.city}`;
}

function titleFor(kind: MarketplaceListingKind, category: string, subcategory: string | null, location: BetaLocation, index: number) {
  if (kind === "GOODS") return goodsTitle(category, subcategory, index);
  if (kind === "VEHICLE") return vehicleTitle(category, index);
  if (kind === "RENTAL") return rentalTitle(category, subcategory, location, index);
  if (kind === "SERVICE") return serviceTitle(category, subcategory, location, index);
  if (kind === "JOB") return jobTitle(subcategory, location, index);
  return auditorTitle(category, location, index);
}

function attributesFor(kind: MarketplaceListingKind, category: string, subcategory: string | null, location: BetaLocation, index: number) {
  const common = { seedTag: MARKETPLACE_BETA_TAG, fixtureVersion: 1, betaTest: true };
  if (kind === "VEHICLE") {
    const [make, model] = vehicleForCategory(category, index);
    return { ...common, year: 2013 + (index % 13), make, model, mileage: 18_000 + (index % 12) * 8_450, mileageUnit: location.countryCode === "US" || location.countryCode === "GB" ? "mi" : "km", transmission: index % 3 === 0 ? "Manual" : "Automatic", fuelType: index % 7 === 0 ? "Electric" : "Gasoline", titleStatus: "Clear", sellerType: "private", showVin: false };
  }
  if (kind === "RENTAL") return { ...common, propertyType: category === "Housing Wanted" ? "other" : category === "Storage & Parking" ? "storage" : category.toLowerCase().includes("apartment") ? "apartment" : category.toLowerCase().includes("house") ? "house" : category.toLowerCase().includes("room") ? "room" : category.toLowerCase().includes("short") ? "short-term" : category.toLowerCase().includes("commercial") ? "commercial" : category === "Land" ? "land" : "other", rentCadence: category === "Short-term Stays" ? "week" : "month", bedrooms: category === "Storage & Parking" ? null : 1 + (index % 4), bathrooms: 1 + (index % 3), area: 520 + (index % 10) * 115, areaUnit: location.countryCode === "US" ? "sqft" : "sqm", furnished: index % 2 === 0, pets: index % 3 === 0 ? "Pets considered" : "Ask about pets", parking: "One space available", amenities: ["Laundry", "Internet ready", "Natural light"], listerType: category === "Housing Wanted" ? "wanted" : "owner" };
  if (kind === "SERVICE") return { ...common, serviceArea: `${location.city} and surrounding area`, deliveryMode: index % 4 === 0 ? "remote" : index % 3 === 0 ? "both" : "on-site", pricingModel: index % 4 === 0 ? "quote" : "hourly", availability: "Weekday and selected weekend appointments", turnaround: "Most requests scheduled within one week", licenseAttested: true };
  if (kind === "JOB") return { ...common, companyName: pick(COMPANIES, index), workArrangement: index % 5 === 0 ? "remote" : index % 3 === 0 ? "hybrid" : "on-site", employmentType: index % 4 === 0 ? "contract" : "full-time", compensationPeriod: "year", responsibilities: `Coordinate ${subcategory?.toLowerCase() ?? category.toLowerCase()} work, communicate progress, and deliver consistent results.`, requirements: "Clear communication, dependable follow-through, and relevant practical experience.", preferences: "Experience working with small teams and customer-facing projects is helpful.", benefits: "Flexible scheduling, professional development, and paid time off where applicable.", applicationMethod: "Send a short introduction and relevant work history through Theta-Space messages.", candidateSkills: [] };
  if (kind === "AUDITOR") return { ...common, directoryKind: category === "Field Auditors" ? "field-auditor" : category === "Field Groups" ? "field-group" : category === "Class V Orgs" ? "class-v" : category === "SH/AO" ? "sh-ao" : category === "FLAG" ? "flag" : "other", services: [subcategory ?? "Service guidance", "Scheduling consultation"], travelAvailable: index % 3 === 0, remoteAvailable: true, languages: index % 4 === 0 ? ["English", "Spanish"] : ["English"], availability: "Contact for current schedule.", qualifications: "Qualifications and service availability are provided directly during inquiry.", qualificationsAttested: true, practiceOrOrganization: titleFor(kind, category, subcategory, location, index) };
  return { ...common, brand: pick(["Independent", "Heritage", "Workshop", "Classic", "Studio"], index), quantity: 1, age: `${1 + (index % 8)} years`, color: pick(["Natural", "Black", "White", "Blue", "Green", "Silver"], index), defects: index % 5 === 0 ? "Minor cosmetic wear shown in photos." : null, regulatedCategory: "none", legalComplianceAttested: true };
}

function imageUrl(kind: MarketplaceListingKind, category: string, subcategory: string | null, index: number) {
  const keyword = slugify([subcategory || category, kind === "JOB" ? "office" : ""].filter(Boolean).join(" "));
  return `https://loremflickr.com/1200/800/${keyword}?lock=${1000 + index}`;
}

export function buildMarketplaceBetaFixtures(listingsPerCategory = MARKETPLACE_BETA_LISTINGS_PER_CATEGORY, now = new Date()) {
  const fixtures: MarketplaceBetaFixture[] = [];
  for (const [kind, categories] of Object.entries(MARKETPLACE_TAXONOMY) as Array<[MarketplaceListingKind, typeof MARKETPLACE_TAXONOMY[MarketplaceListingKind]]>) {
    for (const category of categories) {
      for (let index = 0; index < listingsPerCategory; index += 1) {
        const location = pick(LOCATIONS, fixtures.length + index);
        const subcategory = category.subcategories.length ? pick(category.subcategories, index) : null;
        const baseTitle = titleFor(kind, category.label, subcategory, location, index);
        const slug = `beta-market-${slugify(kind)}-${slugify(category.label)}-${String(index + 1).padStart(3, "0")}`;
        const wanted = category.label.includes("Wanted") || index % 11 === 0;
        const title = wanted && !baseTitle.toLowerCase().startsWith("seeking") && !baseTitle.toLowerCase().startsWith("looking for") && !baseTitle.toLowerCase().startsWith("need ") ? `Wanted: ${baseTitle}` : baseTitle;
        const publishedAt = new Date(now.getTime() - ((fixtures.length * 37 + index * 17) % (45 * 24 * 60)) * 60_000);
        const price = listingPrice(kind, location, index, category.label);
        const company = kind === "JOB" ? pick(COMPANIES, index) : null;
        const context = company ? ` with ${company}` : "";
        fixtures.push({
          ...price,
          attributes: attributesFor(kind, category.label, subcategory, location, index),
          category: category.label,
          city: location.city,
          condition: kind === "GOODS" || kind === "VEHICLE" ? pick(CONDITIONS, index) : null,
          countryCode: location.countryCode,
          createdAt: publishedAt,
          currency: location.currency,
          deliveryAvailable: kind === "GOODS" && index % 3 === 0,
          description: `${title} is available in ${location.city}${context}. The listing includes the practical details a buyer or requester needs to decide whether to make contact. Condition, availability, pricing, and arrangements are stated clearly, and reasonable questions are welcome through Theta-Space messages.`,
          imageUrl: imageUrl(kind, category.label, subcategory, fixtures.length + index),
          intent: wanted ? "WANTED" : "OFFER",
          kind,
          publishedAt,
          region: location.region,
          remote: (kind === "SERVICE" || kind === "JOB" || kind === "AUDITOR") && index % 5 === 0,
          slug,
          subcategory,
          summary: `${subcategory ?? category.label} ${wanted ? "wanted" : "available"} in ${location.city}. ${kind === "JOB" ? "Clear responsibilities, compensation, and application details." : "Practical details and straightforward contact options included."}`,
          title,
        });
      }
    }
  }
  return fixtures;
}
