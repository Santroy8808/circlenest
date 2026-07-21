export type ContributorOfferApiErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "ADMIN_ACCESS_REQUIRED"
  | "COMMAND_ID_CONFLICT"
  | "INVALID_REQUEST"
  | "OFFER_NOT_FOUND"
  | "OFFER_NOT_OWNED"
  | "OFFER_UNAVAILABLE"
  | "TARGET_NOT_FOUND"
  | "TARGET_NOT_FREE"
  | "TARGET_PROTECTED";

export type ContributorOfferApiError = {
  error: string;
  code: ContributorOfferApiErrorCode;
  recovery: string;
};

export function classifyContributorOfferApiError(message: string): {
  code: ContributorOfferApiErrorCode;
  status: number;
  recovery: string;
} {
  if (/admin access required/i.test(message)) {
    return {
      code: "ADMIN_ACCESS_REQUIRED",
      status: 403,
      recovery: "Sign in with an administrator account that can manage this member."
    };
  }
  if (/command id has already been used/i.test(message)) {
    return {
      code: "COMMAND_ID_CONFLICT",
      status: 409,
      recovery: "Create a new command id before submitting a different change."
    };
  }
  if (/different account/i.test(message)) {
    return {
      code: "OFFER_NOT_OWNED",
      status: 403,
      recovery: "Refresh Membership to load the offer assigned to this account."
    };
  }
  if (/target member was not found|target member.*inactive/i.test(message)) {
    return {
      code: "TARGET_NOT_FOUND",
      status: 404,
      recovery: "Refresh the account record and confirm that the member is active."
    };
  }
  if (/offer was not found/i.test(message)) {
    return {
      code: "OFFER_NOT_FOUND",
      status: 404,
      recovery: "Refresh Membership to load the current Contributor offer."
    };
  }
  if (/protected from this administrator action/i.test(message)) {
    return {
      code: "TARGET_PROTECTED",
      status: 403,
      recovery: "Choose an account below your administrator role."
    };
  }
  if (/only.*free|no longer free/i.test(message)) {
    return {
      code: "TARGET_NOT_FREE",
      status: 409,
      recovery: "Refresh the member's current membership before making another change."
    };
  }
  if (/expired|revoked|superseded|no longer eligible|changed before|accepted membership/i.test(message)) {
    return {
      code: "OFFER_UNAVAILABLE",
      status: 409,
      recovery: "Refresh Membership to load the latest offer status."
    };
  }

  return {
    code: "INVALID_REQUEST",
    status: 400,
    recovery: "Review the submitted information and try again."
  };
}

export function contributorOfferApiError(message: string): ContributorOfferApiError & { status: number } {
  return { error: message, ...classifyContributorOfferApiError(message) };
}
