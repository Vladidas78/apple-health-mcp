import type { Metadata, Viewport } from "next";
import { FONTS_HREF } from "@/lib/dashboard/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coach",
  description: "Tägliches Trainings-Dashboard: Kraft & Figur Q4 2026.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Coach" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5efe6" },
    { media: "(prefers-color-scheme: dark)", color: "#2d2a24" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS_HREF} />
      </head>
      <body>{children}</body>
    </html>
  );
}
