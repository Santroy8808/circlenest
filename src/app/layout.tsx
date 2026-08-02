import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { Suspense } from "react";
import { GlobalFeedbackLinkGate } from "@/components/feedback/global-feedback-link-gate";
import { BackgroundGalleryUploadProvider } from "@/components/gallery/background-gallery-upload-provider";
import { GlobalTooltipProvider } from "@/components/platform/global-tooltip-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Theta-Space",
    template: "%s | Theta-Space"
  },
  applicationName: "Theta-Space",
  description: "Private modular social platform for Theta-Space.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/assets/theta-space-theta.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/assets/theta-space-theta.svg", type: "image/svg+xml" }]
  }
};

export const viewport: Viewport = {
  initialScale: 1,
  viewportFit: "cover",
  width: "device-width"
};

async function isAndroidAppRequest() {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const userAgent = requestHeaders.get("user-agent") ?? "";
  const platformCookie = cookieStore.get("theta_platform")?.value ?? "";
  const platformHeader = requestHeaders.get("x-theta-platform") ?? "";

  const explicitAppMarker = [
    platformCookie,
    platformHeader,
    requestHeaders.get("x-requested-with") ?? ""
  ].some((value) => /android|theta-space|thetaspace/i.test(value));

  return explicitAppMarker || /theta-space|thetaspace|webview|\bwv\b/i.test(userAgent);
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const appClassName = (await isAndroidAppRequest()) ? "theta-android-app" : undefined;

  return (
    <html className={appClassName} lang="en">
      <head>
        <link as="image" href="/assets/theta-send-logo.png" rel="preload" />
      </head>
      <body className={appClassName}>
        <BackgroundGalleryUploadProvider>
          {children}
          <Suspense fallback={null}>
            <GlobalFeedbackLinkGate />
          </Suspense>
          <GlobalTooltipProvider />
        </BackgroundGalleryUploadProvider>
      </body>
    </html>
  );
}
