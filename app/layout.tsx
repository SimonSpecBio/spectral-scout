import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import PwaRegister from "./PwaRegister";
import "./globals.css";

// Clean geometric sans per the design brief -- self-hosted via next/font
// (no external <link>, no layout-shift flash), same approach spectral-ops
// already uses for its own fonts.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });

// PWA identity (INSTALL_PWA.md) -- Next's metadata API generates the
// <head> tags itself (manifest link, apple-touch-icon, apple-mobile-web-app-*
// meta) rather than hand-written <meta> tags, so they can't drift out of
// sync with what's actually served.
export const metadata: Metadata = {
  title: "Spectral Scout",
  description: "Free pest scouting and crop protection management for controlled-environment agriculture.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.png",
    apple: "/icons/apple-touch-180.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Scout",
  },
};

export const viewport: Viewport = {
  themeColor: "#0D1524",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={manrope.variable}>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
