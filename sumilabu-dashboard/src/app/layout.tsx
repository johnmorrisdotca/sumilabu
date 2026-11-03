import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { AdminToolbar } from "@/components/auth/admin-toolbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SumiLabu Fleet Dashboard",
  description: "Private.",
  /* Every page is private (SUMILABU-7); nothing here is for a search engine. */
  robots: { index: false, follow: false },
  icons: {
    icon: "/sumilabu.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AdminToolbar />
        {children}
      </body>
    </html>
  );
}
