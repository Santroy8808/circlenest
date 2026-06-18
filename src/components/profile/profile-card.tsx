import Link from "next/link";
import type { ProfileCardView } from "@/modules/profile-identity/types";

function initials(displayName: string) {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function ProfileCard({ profile, ownerControls = false }: { profile: ProfileCardView; ownerControls?: boolean }) {
  return (
    <article className="profile-card overflow-hidden rounded-md">
      <div
        className="profile-banner"
        style={profile.bannerUrl ? { backgroundImage: `url(${profile.bannerUrl})` } : undefined}
      />
      <div className="p-5">
        <div className="-mt-14 flex flex-wrap items-end justify-between gap-4">
          <div className="profile-avatar">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" src={profile.avatarUrl} />
            ) : (
              <span>{initials(profile.displayName) || "TS"}</span>
            )}
          </div>
          {ownerControls ? (
            <Link className="btn-secondary" href="/profile/edit">
              Edit profile
            </Link>
          ) : null}
        </div>
        <div className="mt-4">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">@{profile.username}</p>
          <h1 className="mt-1 text-3xl font-semibold">{profile.displayName}</h1>
          {profile.tagline ? <p className="mt-2 text-lg text-[var(--muted)]">{profile.tagline}</p> : null}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="pill rounded-full px-3 py-1 text-xs font-semibold">{profile.tier}</span>
          <span className="pill rounded-full px-3 py-1 text-xs font-semibold">{profile.visibility}</span>
          {profile.location ? <span className="pill rounded-full px-3 py-1 text-xs font-semibold">{profile.location}</span> : null}
        </div>
        {profile.bio ? <p className="mt-5 whitespace-pre-wrap leading-7 text-[var(--text)]">{profile.bio}</p> : null}
      </div>
    </article>
  );
}
