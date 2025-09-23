# DLMM Playground (Devnet/Mainnet)

A tiny demo UI to explore DLMM Liquidity Bins on Solana.
- Connect Phantom wallet
- SOL/USDC price with manual refresh
- Paste DLMM **Pool Address** and render **Liquidity Bins**
- Light/Dark theme, responsive
- Deployed on Vercel

> Bins fetched from Meteora DLMM indexer (when available).
> If upstream is empty/unavailable, we render **synthetic demo bins** as fallback to keep the UI stable.

## Live
- https://YOUR-DOMAIN-HERE

## Run locally
```bash
npm install
cp .env.example .env.local
npm run dev
