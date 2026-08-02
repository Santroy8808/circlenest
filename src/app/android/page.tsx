import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Android Apps",
  description: "Download and install the official Theta-Space and Theta-Comm Android beta apps."
};

const apps = [
  {
    id: "theta-space",
    name: "Theta-Space",
    version: "24.0.45",
    filename: "Theta-Space-Android-v24.0.45.apk",
    size: "About 4 MB",
    logo: "/assets/theta-space-theta.svg",
    logoAlt: "Theta-Space",
    summary: "The complete Theta-Space member experience for Android.",
    details: "Use your stream, profile, photos, contacts, groups, Market, Jobs, notifications, and the rest of your available membership features from one app.",
    compatibility: "Android 8 or newer"
  },
  {
    id: "theta-comm",
    name: "Theta-Comm",
    version: "2.0.0 beta 1",
    filename: "Theta-Comm-Android-v2.0.0-beta01.apk",
    size: "About 120 MB",
    logo: "/assets/theta-send-logo.png",
    logoAlt: "Theta-Comm",
    summary: "The focused, encrypted Theta-Space messenger.",
    details: "Use it when you want a dedicated chat experience for direct conversations, chat groups, media, and files without opening the full Theta-Space app.",
    compatibility: "64-bit Android devices"
  }
] as const;

const installationSteps = [
  {
    title: "Download the app",
    body: "Open this page on your Android phone and tap the Download button for the app you want."
  },
  {
    title: "Open the APK",
    body: "When the download finishes, tap the downloaded file from your browser or the Downloads app."
  },
  {
    title: "Allow this installation",
    body: "If Android blocks the install, tap Settings on the prompt, enable Allow from this source for the browser you used, then return to the installer."
  },
  {
    title: "Install and sign in",
    body: "Tap Install, then Open. Sign in with the same Theta-Space account you use on theta-space.net."
  }
] as const;

export default function AndroidDownloadsPage() {
  return (
    <main className="android-download-page">
      <header className="android-download-topbar">
        <Link className="android-download-brand" href="/">
          <Image alt="" aria-hidden="true" height={42} src="/assets/theta-space-theta.svg" width={42} />
          <span>Theta-Space</span>
        </Link>
        <Link className="btn-secondary" href="/login">
          Member login
        </Link>
      </header>

      <div className="android-download-content">
        <section className="android-download-intro" aria-labelledby="android-download-title">
          <p className="android-download-kicker">Official Android beta</p>
          <h1 id="android-download-title">Choose your Theta-Space app</h1>
          <p>
            These apps are distributed directly by Theta-Space while Play Store publishing is being prepared. Download only from
            <strong> theta-space.net</strong>.
          </p>
        </section>

        <section aria-label="Available Android apps" className="android-download-grid">
          {apps.map((app) => (
            <article className="android-app-card" key={app.id}>
              <div className="android-app-card-heading">
                <span className="android-app-logo">
                  <Image alt={app.logoAlt} height={72} src={app.logo} width={72} />
                </span>
                <div>
                  <span className="android-beta-badge">Internal beta</span>
                  <h2>{app.name}</h2>
                  <p>Version {app.version}</p>
                </div>
              </div>
              <strong className="android-app-summary">{app.summary}</strong>
              <p className="android-app-details">{app.details}</p>
              <dl className="android-app-facts">
                <div>
                  <dt>Works on</dt>
                  <dd>{app.compatibility}</dd>
                </div>
                <div>
                  <dt>Download</dt>
                  <dd>{app.size}</dd>
                </div>
              </dl>
              <a className="btn-primary android-download-button" download href={`/api/android/download/${app.id}`}>
                Download {app.name}
              </a>
              <p className="android-download-filename">Downloads as {app.filename}</p>
            </article>
          ))}
        </section>

        <section className="android-install-section" aria-labelledby="install-android-title">
          <div className="android-section-heading">
            <p className="android-download-kicker">Installation</p>
            <h2 id="install-android-title">Install an app downloaded outside Play Store</h2>
            <p>Android may call this installing an unknown app. The permission applies only to the browser or Downloads app you choose.</p>
          </div>
          <ol className="android-install-steps">
            {installationSteps.map((step, index) => (
              <li key={step.title}>
                <span aria-hidden="true">{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="android-download-notes" aria-label="Beta app guidance">
          <div>
            <h2>Updates</h2>
            <p>
              Updates are not automatic yet. Return to this page for a newer version and install it over the current app. Do not uninstall first unless support asks you to do so.
            </p>
          </div>
          <div>
            <h2>Android security warning</h2>
            <p>
              Android or Play Protect may warn that the app did not come from Play Store. Confirm that the download came from theta-space.net before continuing. Never install a copy sent through an unrelated website or file-sharing service.
            </p>
          </div>
          <div>
            <h2>Need both?</h2>
            <p>
              You can install Theta-Space and Theta-Comm on the same phone. They are separate apps and use the same Theta-Space member account.
            </p>
          </div>
        </section>

        <footer className="android-download-footer">
          <span>Questions or installation trouble?</span>
          <a href="mailto:support@theta-space.net">support@theta-space.net</a>
        </footer>
      </div>
    </main>
  );
}
