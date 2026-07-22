import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";

import { QueryProvider } from "@/components/query-provider";

import "./globals.css";

const display = Manrope({ subsets: ["latin"], variable: "--font-display" });
const body = DM_Sans({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "SourceLens — grounded answers from your documents",
  description: "Upload documents, ask questions, and inspect every source.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable}`}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
