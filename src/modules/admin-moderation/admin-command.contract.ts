/**
 * Stable target reference carried by every state-changing administrator command.
 * The actor is intentionally not accepted from request payloads; callers derive it
 * from the authenticated session.
 */
export type AdminCommandTarget<TType extends string = string> = {
  type: TType;
  id: string;
};

/**
 * Shared envelope for auditable, retry-safe administrator commands.
 *
 * `commandId` is a caller-generated UUID/idempotency key. Implementations must
 * persist it uniquely and return the original receipt when the command is retried.
 * `expectedVersion` supports optimistic concurrency where the target is versioned.
 */
export type AdminCommand<
  TAction extends string,
  TPayload,
  TTarget extends AdminCommandTarget | null = AdminCommandTarget | null
> = {
  commandId: string;
  action: TAction;
  target: TTarget;
  reason: string;
  expectedVersion?: number;
  payload: TPayload;
};

export type AdminCommandReceipt<TResult> = {
  commandId: string;
  auditLogId: string;
  status: "completed";
  replayed: boolean;
  result: TResult;
};

export type AdminCommandErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "TARGET_NOT_FOUND"
  | "VALIDATION_FAILED"
  | "VERSION_CONFLICT"
  | "COMMAND_FAILED";

export type AdminCommandError = {
  code: AdminCommandErrorCode;
  message: string;
  field?: string;
  retryable: boolean;
};
