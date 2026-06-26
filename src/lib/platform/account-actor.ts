import { cookies } from "next/headers";
import {
  ACCOUNT_ACTOR_COOKIE_NAME,
  listAccountActors,
  resolveAccountActorUserId,
  type AccountActorView
} from "@/modules/business-accounts/business-accounts.service";

export type ActiveAccountActor = {
  actorUserId: string;
  kind: AccountActorView["kind"];
};

export async function getActiveAccountActor(privateUserId: string): Promise<ActiveAccountActor> {
  const requestedActorUserId = cookies().get(ACCOUNT_ACTOR_COOKIE_NAME)?.value;
  const resolved = await resolveAccountActorUserId(privateUserId, requestedActorUserId);

  if (!resolved.ok) {
    return { actorUserId: privateUserId, kind: "PERSONAL" };
  }

  return { actorUserId: resolved.actorUserId, kind: resolved.kind };
}

export async function getAccountActorPicker(privateUserId: string) {
  const [active, actors] = await Promise.all([
    getActiveAccountActor(privateUserId),
    listAccountActors(privateUserId)
  ]);

  return {
    activeActorUserId: active.actorUserId,
    activeKind: active.kind,
    actors
  };
}
