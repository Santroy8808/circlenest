import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Suspense } from "react";
import { GlobalFeedbackLink } from "@/components/feedback/global-feedback-link";
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
    icon: [{ url: "/assets/theta-space-icon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/assets/theta-space-icon.svg", type: "image/svg+xml" }]
  }
};

function isAndroidAppRequest() {
  const requestHeaders = headers();
  const cookieStore = cookies();
  const userAgent = requestHeaders.get("user-agent") ?? "";
  const platformCookie = cookieStore.get("theta_platform")?.value ?? "";
  const platformHeader = requestHeaders.get("x-theta-platform") ?? "";

  return [
    userAgent,
    platformCookie,
    platformHeader,
    requestHeaders.get("x-requested-with") ?? "",
    requestHeaders.get("sec-ch-ua-platform") ?? "",
    requestHeaders.get("sec-ch-ua-model") ?? ""
  ].some((value) => /android|theta-space|thetaspace|webview|wv/i.test(value));
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const appClassName = isAndroidAppRequest() ? "theta-android-app" : undefined;

  return (
    <html className={appClassName} lang="en">
      <head>
        <link as="image" href="/assets/theta-send-logo.png" rel="preload" />
      </head>
      <body className={appClassName}>
        <BackgroundGalleryUploadProvider>
          {children}
          <Suspense fallback={null}>
            <GlobalFeedbackLink />
          </Suspense>
          <GlobalTooltipProvider />
        </BackgroundGalleryUploadProvider>
      </body>
    </html>
  );
}
