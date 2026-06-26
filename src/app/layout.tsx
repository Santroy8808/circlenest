import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Suspense } from "react";
import { GlobalFeedbackLink } from "@/components/feedback/global-feedback-link";
import { BackgroundGalleryUploadProvider } from "@/components/gallery/background-gallery-upload-provider";
import { GlobalTooltipProvider } from "@/components/platform/global-tooltip-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Theta-Space Rebuild",
  description: "Private modular social platform rebuild for Theta-Space."
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
