import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

// Clean geometric sans per the design brief -- self-hosted via next/font
// (no external <link>, no layout-shift flash), same approach spectral-ops
// already uses for its own fonts.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Spectral Scout",
  description: "Free pest scouting and crop protection management for controlled-environment agriculture.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={manrope.variable}>{children}</body>
    </html>
  );
}
