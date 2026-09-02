import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
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

// Pinch/double-tap zoom is disabled app-wide (ticket C2) -- there's no
// per-route override in App Router's viewport export, so MapEditor.tsx's
// Konva Stage and BayBarMap.tsx's plain SVG each need their own JS-driven
// zoom to make up for losing native pinch.
export const viewport: Viewport = {
  themeColor: "#F6F4F0",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="en" data-theme={theme}>
      <body className={manrope.variable}>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
