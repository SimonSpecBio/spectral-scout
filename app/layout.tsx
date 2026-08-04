import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spectral Scout",
  description: "Free pest scouting and crop protection management for controlled-environment agriculture.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
