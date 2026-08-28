import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

/*
 * Same two families as APX Ledger: Inter carries everything, figures included,
 * with tabular numerals; Outfit is what makes a heading read as a heading.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "APX Reach — The CRM that knows your books",
    template: "%s — APX Reach",
  },
  description:
    "Contacts, deals and follow-up for small business — connected to APX Ledger, so your CRM and your books agree.",
  applicationName: "APX Reach",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
