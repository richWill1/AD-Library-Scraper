import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdSnoop · Competitor advertising intelligence",
  description: "Discover live competitor ads, creative trends and messaging intelligence with AdSnoop.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
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
