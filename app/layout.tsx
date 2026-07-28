import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RetfenyMozi — Local Cinema",
  description:
    "Now showing, showtimes, and visitor information for RetfenyMozi, a small single-screen local cinema.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable}`}
    >
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <nav className="site-nav">
          <Link href="/" className="wordmark">
            RetfenyMozi
          </Link>
          <div className="links">
            <Link href="/">Now Showing</Link>
            <Link href="/showtimes">Showtimes</Link>
            <Link href="/about">About</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
