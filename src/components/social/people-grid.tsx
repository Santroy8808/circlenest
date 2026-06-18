import type { PeopleCardView } from "@/modules/social-graph/types";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function PeopleGrid({ people }: { people: PeopleCardView[] }) {
  if (people.length === 0) {
    return (
      <section className="surface rounded-md p-6 text-center">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">No people yet</h2>
        <p className="mt-2 text-[var(--muted)]">Friends, family, and contacts will appear here as relationship data is created.</p>
      </section>
    );
  }

  return (
    <section className="people-grid">
      {people.map((person) => (
        <article className="people-card" key={person.id}>
          <div className="people-avatar">
            {person.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" src={person.avatarUrl} />
            ) : (
              <span>{initials(person.displayName) || "TS"}</span>
            )}
          </div>
          <h2 className="mt-3 text-lg font-semibold">{person.displayName}</h2>
          <p className="text-sm text-[var(--muted)]">@{person.username}</p>
          {person.location ? <p className="mt-1 text-sm text-[var(--muted)]">{person.location}</p> : null}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {person.relationships.map((relationship) => (
              <span className="pill rounded-full px-2 py-1 text-[11px] font-semibold" key={relationship}>
                {relationship}
              </span>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
