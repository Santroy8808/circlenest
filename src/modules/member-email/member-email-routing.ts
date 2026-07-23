import { readPlatformEnv } from "@/lib/platform/env";
import {
  immutableMemberIdSchema,
  memberMailboxAddressSchema,
  type MemberMailEnvelope,
  type MemberMailRoute
} from "@/modules/member-email/types";

function splitMailboxAddress(address: string) {
  const normalized = memberMailboxAddressSchema.parse(address);
  const separator = normalized.lastIndexOf("@");
  return {
    address: normalized,
    localPart: normalized.slice(0, separator),
    domain: normalized.slice(separator + 1)
  };
}

export function createMemberMailRoute(
  userIdInput: string,
  baseAddressInput = readPlatformEnv().MEMBER_MAIL_BASE_ADDRESS
): MemberMailRoute {
  const userId = immutableMemberIdSchema.parse(userIdInput);
  const base = splitMailboxAddress(baseAddressInput);
  const tag = userId;

  return {
    userId,
    tag,
    baseAddress: base.address,
    address: `${base.localPart}+${tag}@${base.domain}`
  };
}

export function parseMemberMailRoute(
  recipientAddress: string,
  baseAddressInput = readPlatformEnv().MEMBER_MAIL_BASE_ADDRESS
): MemberMailRoute | null {
  const base = splitMailboxAddress(baseAddressInput);
  const recipient = splitMailboxAddress(recipientAddress);
  const prefix = `${base.localPart}+`;

  if (recipient.domain !== base.domain || !recipient.localPart.startsWith(prefix)) {
    return null;
  }

  const parsedUserId = immutableMemberIdSchema.safeParse(recipient.localPart.slice(prefix.length));
  if (!parsedUserId.success) return null;

  return createMemberMailRoute(parsedUserId.data, base.address);
}

export function createOutboundMemberMailEnvelope(
  userId: string,
  recipientAddress: string,
  baseAddressInput = readPlatformEnv().MEMBER_MAIL_BASE_ADDRESS
): MemberMailEnvelope {
  const route = createMemberMailRoute(userId, baseAddressInput);
  const recipient = memberMailboxAddressSchema.parse(recipientAddress);

  return {
    direction: "outbound",
    ownerUserId: route.userId,
    from: route.baseAddress,
    to: [recipient],
    replyTo: route.address
  };
}
