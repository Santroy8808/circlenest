import { z } from "zod";

export const immutableMemberIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Member ID cannot be represented safely in an email subaddress.");

export const memberMailboxAddressSchema = z.string().trim().toLowerCase().email();

export type MemberMailDirection = "inbound" | "outbound";

export type MemberMailRoute = {
  userId: string;
  address: string;
  baseAddress: string;
  tag: string;
};

export type MemberMailEnvelope = {
  direction: MemberMailDirection;
  ownerUserId: string;
  from: string;
  to: string[];
  replyTo: string;
};
