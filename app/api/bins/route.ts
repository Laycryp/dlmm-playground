// app/api/bins/route.ts
import { NextResponse } from "next/server";

type BinPoint = { price: number; liquidity: number };

const BASE = "https://dlmm-api.meteora.ag";

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function extractBin(obj: unknown): BinPoint | null {
  if (!obj || typeof obj !== "object") return null;
  const r = obj as Record<string, unknown>;

  const price =
    isFiniteNumber(r.price) ||
    isFiniteNumber(r.binPrice) ||
    isFiniteNumber(r.p)
      ? Number((r.price ?? r.binPrice ?? r.p) as number)
      : null;

  const liq =
    isFiniteNumber(r.liquidity) ||
    isFiniteNumber(r.binLiquidity) ||
    isFiniteNumber(r.l)
      ? Number((r.liquidity ?? r.binLiquidity ?? r.l) as number)
      : null;

  if (price == null || liq == null) return null;
  return { price, liquidity: Math.max(0, liq) };
}

async function fetchJson<T>(url: string): Promise<{ ok: boolean; data?: T; status: number }> {
  try {
    const res = await fetch(url, { next: { revalidate: 15 } });
    if (!res.ok) return { ok: false, status: res.status };
    const data = (await res.json()) as T;
    return { ok: true, data, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);

  // network: mainnet | devnet  (الافتراضي mainnet الآن لأنك تختبر mainnet)
  const networkParam = (searchParams.get("network") ?? "mainnet").toLowerCase();
  const network = networkParam === "devnet" ? "devnet" : "mainnet";

  // العنوان الذي تُدخله في الواجهة
  const pool = (searchParams.get("pool") || "").trim();

  if (!pool) {
    return NextResponse.json(
      {
        source: "fallback-demo",
        reason: "no-pool-provided",
        network,
        bins: demoBins(),
      },
      { headers: { "Cache-Control": "no-store", "x-origin": origin } }
    );
  }

  // 1) احصل على قائمة الأزواج من الإندكسر
  const listUrl = `${BASE}/pair/all?network=${network}`;
  const listRes = await fetchJson<Array<Record<string, unknown>>>(listUrl);

  if (listRes.ok && Array.isArray(listRes.data)) {
    const found = listRes.data.find((p) => {
      const addr = typeof p.address === "string" ? p.address : "";
      return addr === pool;
    });

    if (found) {
      // 2) اطلب الـ bins للعنوان المحدد
      const binsUrl = `${BASE}/pair/${pool}/bins?network=${network}`;
      const binsRes = await fetchJson<unknown>(binsUrl);

      if (binsRes.ok && binsRes.data) {
        const raw = Array.isArray(binsRes.data) ? binsRes.data : [];
        const bins: BinPoint[] = raw
          .map(extractBin)
          .filter((x): x is BinPoint => x !== null)
          .sort((a, b) => a.price - b.price);

        if (bins.length > 0) {
          return NextResponse.json(
            {
              source: "upstream-indexer",
              network,
              pool,
              bins,
              updatedAt: new Date().toISOString(),
            },
            {
              headers: {
                "Cache-Control": "max-age=0, s-maxage=15",
                "x-origin": origin,
              },
            }
          );
        }
      }
    }
  }

  // 3) Fallback — demo bins
  return NextResponse.json(
    {
      source: "fallback-demo",
      reason: listRes.ok ? "indexer-empty-or-not-found" : "indexer-unreachable",
      network,
      pool,
      bins: demoBins(),
      updatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store", "x-origin": origin } }
  );
}

/** Demo bins (symmetric bump) */
function demoBins(): BinPoint[] {
  const prices = Array.from({ length: 25 }, (_, i) => 88 + i);
  const liq = prices.map((_, i) => {
    const mid = 12;
    const d = Math.abs(i - mid);
    return Math.max(12, 120 - d * 6);
  });
  return prices.map((price, i) => ({ price, liquidity: liq[i] }));
}
