# DLMM Playground (Devnet)

A minimal, clean UI to explore **DLMM Liquidity Bins** on Solana **Devnet**, with:
- Phantom wallet connect
- Live SOL/USDC price + refresh
- Liquidity bins bar chart
- Light/Dark theme toggle
- Safe **fallback demo** bins when upstream DLMM data isn’t available

**Live Demo:** https://www.laycryp.com  
**Repository:** https://github.com/Laycryp/dlmm-playground

---

## ✨ Features
- Connect Phantom wallet (Devnet)
- Live SOL price in USDC with a Refresh button
- Liquidity Bins visualized as a purple bar chart (recharts)
- Example pool shortcuts field (Devnet)
- Light/Dark mode
- Resilient UX: if SDK/REST cannot fetch bins, a local demo dataset is shown

> Note: For the hackathon scope, data is shown on **Devnet** and gracefully falls back to demo bins whenever upstream endpoints are unavailable or restricted.

---

## 🛠️ Tech Stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- `recharts`
- `@solana/wallet-adapter-react` (+ Phantom)

---

## 🚀 Local Development
```bash
npm i
npm run dev
# open http://localhost:3000
