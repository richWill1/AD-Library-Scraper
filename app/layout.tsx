import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AD Library Scraper · Creative research",
  description: "Explore brand ad creatives, filter messaging angles, and save your research. Interactive interface preview with verified Sharps sample data.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
