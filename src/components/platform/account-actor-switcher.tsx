"use client";

const ACCOUNT_ACTOR_COOKIE_NAME = "theta_active_actor_user_id";

type AccountActorView = {
  userId: string;
  displayName: string;
  kind: "PERSONAL" | "BUSINESS" | "AUDITOR";
};

function actorLabel(actor: AccountActorView) {
  if (actor.kind === "BUSINESS") return `${actor.displayName} business`;
  if (actor.kind === "AUDITOR") return `${actor.displayName} auditor`;
  return `${actor.displayName} personal`;
}

export function AccountActorSwitcher({
  activeActorUserId,
  actors
}: {
  activeActorUserId: string;
  actors: AccountActorView[];
}) {
  if (actors.length < 2) return null;

  function switchActor(actorUserId: string) {
    document.cookie = `${ACCOUNT_ACTOR_COOKIE_NAME}=${encodeURIComponent(actorUserId)}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  }

  return (
    <label className="account-actor-switcher">
      <span>Using</span>
      <select onChange={(event) => switchActor(event.target.value)} value={activeActorUserId}>
        {actors.map((actor) => (
          <option key={actor.userId} value={actor.userId}>
            {actorLabel(actor)}
          </option>
        ))}
      </select>
    </label>
  );
}
