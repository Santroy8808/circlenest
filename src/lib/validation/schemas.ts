import { z } from "zod";
import { validateStrongPassword } from "@/lib/security/password-policy";

const subscriptionTiers = ["FREE", "PLUS", "PRO", "ADMIN"] as const;
const nullOrEmptyToUndefined = (value: unknown) =>
  value === null || value === undefined || (typeof value === "string" && value.trim() === "")
    ? undefined
    : value;
const optionalText = (max: number) => z.preprocess(nullOrEmptyToUndefined, z.string().max(max).optional());
const isValidMediaUrl = (value: string) => {
  if (value.startsWith("/uploads/")) return true;
  if (value.startsWith("/api/media/")) return true;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol !== "http:") return false;
    const isLocalhost =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1";
    return process.env.NODE_ENV !== "production" && isLocalhost;
  } catch {
    return false;
  }
};
const mediaUrlSchema = z.string().refine(isValidMediaUrl, "Invalid media URL");

export const signupSchema = z.object({
  inviteCode: z.preprocess(nullOrEmptyToUndefined, z.string().min(8).max(500).optional()),
  fullName: z.string().min(2).max(80),
  email: z.string().email(),
  phoneNumber: z.string().min(7).max(30),
  backupEmail: z.preprocess(nullOrEmptyToUndefined, z.string().email().optional()),
  recoveryPhoneNumber: z.preprocess(nullOrEmptyToUndefined, z.string().min(7).max(30).optional()),
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/, "Username can only use letters, numbers, and underscores."),
  password: z.string().min(8).max(72),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  country: z.string().min(2).max(80),
  lastOnLinesAt: optionalText(120),
  lastService: optionalText(120),
  lastServiceWhen: optionalText(120),
  iasStatus: optionalText(120),
  iasNumber: optionalText(120),
  acceptedTerms: z.literal(true),
  subscriptionTier: z.enum(subscriptionTiers),
  interests: z.array(z.string().min(2).max(50)).min(5),
}).superRefine((data, ctx) => {
  const passwordError = validateStrongPassword(data.password);
  if (passwordError) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: passwordError, path: ["password"] });
  }
  const set = new Set(data.interests.map((v) => v.trim().toLowerCase()));
  if (set.size < 5) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please select 5 unique interests.", path: ["interests"] });
  }
});

export const postSchema = z.object({
  content: z.string().min(1).max(5000),
  type: z.preprocess(nullOrEmptyToUndefined, z.enum(["TEXT", "MEDIA", "SHARE", "POLL"]).optional()),
  allowReshare: z.preprocess(nullOrEmptyToUndefined, z.boolean().optional()),
  imageUrl: z.preprocess(nullOrEmptyToUndefined, mediaUrlSchema.optional()),
  mediaUrlsJson: z.preprocess(nullOrEmptyToUndefined, z.string().max(20000).optional()),
  topic: z.preprocess(nullOrEmptyToUndefined, z.string().max(64).optional()),
  audience: z.preprocess(nullOrEmptyToUndefined, z.enum(["ALL", "FRIENDS", "FAMILY", "GROUPS"]).optional()),
  groupId: z.preprocess(nullOrEmptyToUndefined, z.string().min(1).optional()),
  poll: z.preprocess(
    nullOrEmptyToUndefined,
    z.object({
      question: z.string().min(3).max(300),
      options: z.array(z.string().min(1).max(120)).min(2).max(8),
      allowMulti: z.boolean().optional(),
      closesAt: z.string().datetime().optional(),
    }).optional(),
  ),
}).superRefine((data, ctx) => {
  if (data.audience === "GROUPS" && !data.groupId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Group selection is required for Groups audience.",
      path: ["groupId"],
    });
  }
  if (data.type === "POLL" && !data.poll) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Poll data is required for POLL posts.",
      path: ["poll"],
    });
  }
});
