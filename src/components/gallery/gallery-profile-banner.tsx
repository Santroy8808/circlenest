import type { ReactNode } from "react";

export function GalleryProfileBanner({
  action,
  bannerUrl,
  subtitle,
  title = "My Pics"
}: {
  action?: ReactNode;
  bannerUrl?: string | null;
  subtitle?: string;
  title?: string;
}) {
  return (
    <section
      aria-label={`${title} banner`}
      className="gallery-profile-banner surface rounded-md"
      style={bannerUrl ? { backgroundImage: `linear-gradient(180deg, rgba(5, 9, 16, 0.1), rgba(5, 9, 16, 0.76)), url(${bannerUrl})` } : undefined}
    >
      <div className="gallery-profile-banner-content">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{title}</p>
          {subtitle ? <p className="mt-2 text-sm text-[rgba(241,245,249,0.86)]">{subtitle}</p> : null}
        </div>
        {action ? <div className="gallery-profile-banner-action">{action}</div> : null}
      </div>
    </section>
  );
}
