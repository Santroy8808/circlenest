import { z } from "zod";

export const conductAnalysisSchema = z.object({
  shouldReview: z.boolean(),
  confidence: z.number().min(0).max(1),
  policyCodes: z.array(z.string().trim().min(1).max(80)).max(12),
  summary: z.string().trim().max(1000),
  contextNotes: z.string().trim().max(1500),
  suggestedAction: z.enum(["NONE", "HUMAN_REVIEW", "WARNING", "REPORT", "PAIRWISE_RESTRICTION"]),
  targetUserIds: z.array(z.string().trim().min(1).max(100)).max(10)
});

export type ConductAnalysis = z.infer<typeof conductAnalysisSchema>;

export const DEFAULT_CONDUCT_TRIGGERS: Record<string, string[]> = {
  threat: ["i will hurt you", "i'm going to hurt you", "you should die", "kill you", "find where you live"],
  targeted_abuse: ["everyone attack", "go after @", "keep messaging them", "make their life miserable"],
  harassment: ["you are worthless", "nobody wants you", "shut up forever", "leave or else"],
  privacy: ["home address is", "phone number is", "here is their address"],
  fraud: ["send me your password", "give me your login code", "pay this secret fee"]
};

function dictionaryFromUnknown(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_CONDUCT_TRIGGERS;
  const result: Record<string, string[]> = {};
  for (const [code, rawTerms] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(rawTerms)) continue;
    const terms = rawTerms
      .filter((term): term is string => typeof term === "string")
      .map((term) => term.trim().toLowerCase())
      .filter((term) => term.length >= 3 && term.length <= 100)
      .slice(0, 100);
    if (terms.length) result[code.trim().slice(0, 80)] = terms;
  }
  return Object.keys(result).length ? result : DEFAULT_CONDUCT_TRIGGERS;
}

export function detectConductCandidate(body: string, configuredDictionary?: unknown) {
  const normalized = body.toLowerCase().replace(/\s+/g, " ").trim();
  const dictionary = dictionaryFromUnknown(configuredDictionary);
  const matches = Object.entries(dictionary).flatMap(([policyCode, terms]) =>
    terms.filter((term) => normalized.includes(term)).map((term) => ({ policyCode, term }))
  );
  return {
    candidate: matches.length > 0,
    policyCodes: Array.from(new Set(matches.map((match) => match.policyCode))),
    matches
  };
}

export function validateConductAnalysis(value: unknown) {
  const parsed = conductAnalysisSchema.safeParse(value);
  return parsed.success ? { ok: true as const, data: parsed.data } : { ok: false as const, error: parsed.error.message };
}
