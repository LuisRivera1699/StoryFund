import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/hooks/useWallet";
import { AppHeader } from "@/components/wallet-button";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "StoryFund — Pay only for verified work",
  description:
    "Fund software development on Stellar. Escrow locks payments until user stories are verified.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${display.variable} font-sans`}>
        <WalletProvider>
          <AppHeader />
          <main>{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
