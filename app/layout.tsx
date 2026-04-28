import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "./query-provider";
import { WalletProvider } from "./wallet-context";
import { ErrorListener } from "./error-listener";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Lending Vault",
  description: "Over-collateralized XLM lending pool on Stellar Testnet",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <ErrorListener />
        <QueryProvider>
          <WalletProvider>{children}</WalletProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
