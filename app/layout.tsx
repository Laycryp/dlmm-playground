import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "DLMM Playground",
  description: "Saros DLMM Demo on Solana Devnet",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-800 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
