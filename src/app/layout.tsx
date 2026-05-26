import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CircleNest",
  description: "A friendly social space for real people.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
