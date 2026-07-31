export type AdminInviteWorkflowMode = "new-user" | "existing-user";

export type ExistingInviteAccountSelection = {
  id: string;
  email: string;
  username?: string | null;
};

export function inviteNewUserButtonLabel(sendEmailImmediately: boolean) {
  return sendEmailImmediately ? "Generate and Send Invite" : "Generate Invite Code";
}

export function canGrantExistingUserAccess(account: ExistingInviteAccountSelection | null, isPending = false) {
  return Boolean(account?.id) && !isPending;
}

export function buildInviteNewUserPayload(input: {
  recipientEmail: string;
  expiresInDays: number;
  sendEmailImmediately: boolean;
}) {
  return {
    action: "generate" as const,
    recipientEmail: input.recipientEmail.trim(),
    expiresInDays: input.expiresInDays,
    sendEmail: input.sendEmailImmediately
  };
}

export function buildExistingUserGrantPayload(input: {
  account: ExistingInviteAccountSelection;
  expiresInDays: number;
}) {
  return {
    action: "grant-existing" as const,
    userIdentifier: (input.account.username || input.account.email).trim(),
    expiresInDays: input.expiresInDays
  };
}
