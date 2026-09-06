import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shorts Factory — 10 Shorts, One Run, Every Day",
  description: "Automated pipeline: pick an unused video from the source channel, clip the best moments, burn bottom captions, design thumbnails, schedule 10 shorts per day, and report everything to Telegram.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="noise antialiased">{children}</body>
    </html>
  );
}
