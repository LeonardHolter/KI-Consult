import type { Metadata } from "next";
import { Schibsted_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";

const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-schibsted",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KI Consult — Norskutviklet AI-kundeservice",
  description:
    "KI-agenten som tar telefonen, chatten og webhenvendelsene dine automatisk. Naturlig norsk stemme, BankID & Vipps, hostet i Norge.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nb">
      <body className={`${schibsted.variable} ${spaceMono.variable}`}>{children}</body>
    </html>
  );
}
