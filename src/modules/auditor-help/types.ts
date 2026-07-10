import { z } from "zod";

export const createAuditorHelpAccountSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(100),
  email: z.string().trim().email("Enter a valid email address.").max(180),
  inviteCode: z.string().trim().min(1, "Enter your invite code.").max(128),
  phone: z.string().trim().max(40).optional(),
  resolutionGoal: z.string().trim().max(1200).optional(),
  location: z.string().trim().max(120).optional(),
  relationship: z.string().trim().max(80).optional(),
  bio: z.string().trim().max(1200).optional()
});

export type CreateAuditorHelpAccountInput = z.infer<typeof createAuditorHelpAccountSchema>;
