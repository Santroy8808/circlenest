import type { Metadata } from "next";
import { Suspense } from "react";
import { GlobalFeedbackLink } from "@/components/feedback/global-feedback-link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Theta-Space Rebuild",
  description: "Private modular social platform rebuild for Theta-Space."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Suspense fallback={null}>
          <GlobalFeedbackLink />
        </Suspense>
      </body>
    </html>
  );
}
