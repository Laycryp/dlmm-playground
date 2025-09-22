// app/api/bins/route.ts
import { NextResponse } from "next/server";
import { fetchDemoBins } from "../../../lib/dlmmClient";

type BinPoint = { price: number; liquidity: number };

const DEFAULT_DEVNET_POOL =
  process.env.DLMM_DEVNET_POOL?.trim() || "11111111111111111111111111111111";

function isBase58Pubkey(s: string): boolean {
  const base58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return s.length >= 30 && s.length <= 50 && base58.test(s);
}

function extractBin(obj: unknown): BinPoint | null {
  if (obj === null || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;

  const priceCandidate =
    typeof rec.price === "number"
      ? rec.price
      : typeof rec.binPrice === "number"
      ? rec.binPrice
      : typeof rec.p === "number"
      ? rec.p
      : null;

  const liqCandidate =
    typeof rec.liquidity === "number"
      ? rec.liquidity
      : typeof rec.binLiquidity === "number"
      ? rec.binLiquidity
      : typeof rec.l === "number"
      ? rec.l
      : null;

  if (priceCandidate == null || liqCandidate == null) return null;
  const price = Number(priceCandidate);
  const liquidity = Math.max(0, Number(liqCandidate));
  if (!Number.isFinite(price) || !Number.isFinite(liquidity)) return null;

  return { price, liquidity };
}

const REVALIDATE_SECONDS = 20;

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);

  const networkRaw = (searchParams.get("network") || "devnet").toLowerCase();
  const network: "devnet" | "mainnet" =
    networkRaw === "mainnet" ? "mainnet" : "devnet";

  const poolRaw = (searchParams.get("pool") || DEFAULT_DEVNET_POOL).trim();
  const pool = isBase58Pubkey(poolRaw) ? poolRaw : DEFAULT_DEVNET_POOL;

  // المضيف يختلف بين mainnet/devnet عند Meteora
  const HOST =
    network === "devnet"
      ? "https://devnet-dlmm-api.meteora.ag"
      : "https://dlmm-api.meteora.ag";

  // نجرب عدة مسارات شائعة — أول واحد يشتغل نأخذه
  const candidates = [
    `${HOST}/pools/${pool}/bins?network=${network}`,
    `${HOST}/pair/${pool}/bins?network=${network}`,
    `${HOST}/pools/bins?address=${pool}&network=${network}`,
  ];

  // مهلة آمنة
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    if (!isBase58Pubkey(poolRaw)) {
      throw new Error("invalid-pool-address");
    }

    let usedUrl = "";
    let bins: BinPoint[] = [];

    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          next: { revalidate: REVALIDATE_SECONDS },
          signal: controller.signal,
        });
        if (!res.ok) continue;

        const data: unknown = await res.json();
        const mapped: BinPoint[] = Array.isArray(data)
          ? (data
              .map((d) => extractBin(d))
              .filter((x): x is BinPoint => x !== null) as BinPoint[])
          : [];

        if (mapped.length > 0) {
          usedUrl = url;
          bins = mapped.sort((a, b) => a.price - b.price);
          break;
        }
      } catch {
        // جرّب التالي
      }
    }

    if (bins.length === 0) throw new Error("no-upstream-candidate-worked");

    return NextResponse.json(
      {
        source: "upstream",
        network,
        pool,
        bins,
        binsCount: bins.length,
        upstream: usedUrl,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": `max-age=0, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=30`,
          "x-origin": origin,
        },
      }
    );
  } catch (err) {
    const demo = await fetchDemoBins();
    return NextResponse.json(
      {
        source: "fallback-demo",
        reason:
          err instanceof Error ? err.message : "Failed to fetch pool bins",
        network,
        pool,
        bins: demo,
        binsCount: demo.length,
        updatedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "x-fallback": "true",
          "x-origin": origin,
        },
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}
