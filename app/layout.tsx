import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Catch",
  description: "Catch lyrics and melodies before they get away.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Catch",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0a09",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Loaded at runtime (not next/font) so builds don't need Google Fonts
            access; every family has a system fallback in globals.css. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fondamento:ital@0;1&family=Reenie+Beanie&family=Rock+Salt&family=Rubik:wght@400;500;600&family=Sacramento&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
