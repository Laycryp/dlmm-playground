// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import Providers from "./providers";
import { ThemeProvider } from "next-themes";

export const metadata: Metadata = {
  title: "DLMM Playground — SOL/USDC Bins & Wallet (Devnet)",
  description: "Explore DLMM liquidity bins on Solana Devnet with a clean, wallet-ready UI.",
  metadataBase: new URL("https://www.laycryp.com"),
  alternates: { canonical: "https://www.laycryp.com" },
  openGraph: {
    title: "DLMM Playground",
    description: "Visualize liquidity bins and connect Phantom on Solana Devnet.",
    url: "https://www.laycryp.com",
    siteName: "DLMM Playground",
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "DLMM Playground",
    description: "Visualize liquidity bins and connect Phantom on Solana Devnet.",
    images: ["/og.png"],
  },
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
