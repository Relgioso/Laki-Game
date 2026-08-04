import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Laki-Game",
  description: "Booth prize games: Spin the Wheel and Color Game",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-black/[.08] dark:border-white/[.145] px-6 py-4 flex flex-wrap items-center gap-6">
          <span className="font-semibold text-lg">Laki-Game</span>
          <nav className="flex flex-wrap gap-4 text-sm">
            <Link href="/admin/wheel" className="hover:underline">
              Admin: Wheel
            </Link>
            <Link href="/admin/color-game" className="hover:underline">
              Admin: Color Game
            </Link>
            <Link href="/play/wheel" className="hover:underline">
              Play: Wheel
            </Link>
            <Link href="/play/color-game" className="hover:underline">
              Play: Color Game
            </Link>
          </nav>
        </header>
        <div className="flex flex-col flex-1">{children}</div>
      </body>
    </html>
  );
}
