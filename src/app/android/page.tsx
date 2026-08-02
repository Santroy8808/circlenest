import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

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

export default async function AndroidDownloadsPage() {
  const session = await auth();
  if (!session?.user || session.user.revoked) redirect("/login?callbackUrl=/android");

  const userAgent = (await headers()).get("user-agent") ?? "";
  const isAndroid = /android/i.test(userAgent);

  return (
    <main className="android-download-page">
      <header className="android-download-topbar">
        <Link className="android-download-brand" href="/">
          <Image alt="" aria-hidden="true" height={42} src="/assets/theta-space-theta.svg" width={42} />
          <span>Theta-Space</span>
        </Link>
        <Link className="btn-secondary" href="/home">
          Back to Theta-Space
        </Link>
      </header>

      <div className="android-download-content">
        <section className="android-download-intro" aria-labelledby="android-download-title">
          <p className="android-download-kicker">Android apps</p>
          <h1 id="android-download-title">Open this page on your Android phone</h1>
          <p>You must download the app directly onto the Android phone or tablet where you want to use it.</p>
          <div className={isAndroid ? "android-mobile-required is-ready" : "android-mobile-required"} role="status">
            <strong>{isAndroid ? "You are on an Android device. You can download now." : "You are not viewing this page on an Android device."}</strong>
            <span>{isAndroid ? "Choose one of the two apps below." : "On your Android phone, open Chrome and go to theta-space.net/android. Then log in again."}</span>
          </div>
        </section>

        <section aria-label="Choose an Android app" className="android-download-choice">
          <div className="android-simple-heading">
            <span>2</span>
            <div><h2>Choose your app</h2><p>Most people should install the full Theta-Space app.</p></div>
          </div>
          {apps.map((app) => (
            <article className="android-app-card" key={app.id}>
              <div className="android-app-card-heading">
                <span className="android-app-logo">
                  <Image alt={app.logoAlt} height={72} src={app.logo} width={72} />
                </span>
                <div>
                  <span className="android-beta-badge">{app.id === "theta-space" ? "Recommended" : "Chat only"}</span>
                  <h2>{app.name}</h2>
                </div>
              </div>
              <strong className="android-app-summary">{app.summary}</strong>
              <p className="android-app-details">{app.id === "theta-space" ? "Use the Stream, photos, contacts, groups, Market, Jobs, messages, and all of your membership features." : "Install this only if you want a separate app just for Theta-Space messages."}</p>
              {isAndroid ? <a className="btn-primary android-download-button" download href={`/api/android/download/${app.id}`}>Download {app.name}</a> : <button className="btn-primary android-download-button" disabled type="button">Open this page on Android to download</button>}
            </article>
          ))}
        </section>

        <section className="android-install-section" aria-labelledby="install-android-title">
          <div className="android-section-heading">
            <div className="android-simple-heading"><span>3</span><div><h2 id="install-android-title">Install it</h2><p>After the download finishes, follow these steps on your phone.</p></div></div>
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

        <section className="android-download-notes" aria-label="Important information">
          <div><h2>Only install files from this page</h2><p>Android may warn that the app did not come from Play Store. That is expected during beta testing. Do not install a copy sent by email or another website.</p></div>
          <div><h2>Getting updates</h2><p>Return to this page on your Android phone and download the newest version. Install it over the current app.</p></div>
        </section>

        <footer className="android-download-footer">
          <span>Questions or installation trouble?</span>
          <a href="mailto:support@theta-space.net">support@theta-space.net</a>
        </footer>
      </div>
    </main>
  );
}
