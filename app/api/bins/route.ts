import { NextResponse } from "next/server";
import { fetchDemoBins } from "../../../lib/dlmmClient";

type BinPoint = { price: number; liquidity: number };

const DEFAULT_DEVNET_POOL =
  process.env.DLMM_DEVNET_POOL?.trim() || "11111111111111111111111111111111";

function isBase58Pubkey(s: string): boolean {
  const base58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return s.length >= 30 && s.length <= 60 && base58.test(s);
}

/** يحوّل عنصرًا واحدًا إلى BinPoint إن أمكن */
function toBinPoint(x: unknown): BinPoint | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;

  const price =
    typeof r.price === "number"
      ? r.price
      : typeof r.binPrice === "number"
      ? r.binPrice
      : typeof r.p === "number"
      ? r.p
      : null;

  const liquidity =
    typeof r.liquidity === "number"
      ? r.liquidity
      : typeof r.binLiquidity === "number"
      ? r.binLiquidity
      : typeof r.l === "number"
      ? r.l
      : null;

  if (price == null || liquidity == null) return null;

  const P = Number(price);
  const L = Math.max(0, Number(liquidity));
  if (!Number.isFinite(P) || !Number.isFinite(L)) return null;

  return { price: P, liquidity: L };
}

/** يبحث بعمق داخل أي كائن عن مصفوفة bins صالحة */
function findBinsDeep(x: unknown, depth = 0): BinPoint[] {
  if (depth > 4 || x == null || typeof x !== "object") return [];
  // لو كانت مصفوفة في الجذر
  if (Array.isArray(x)) {
    const mapped = x.map(toBinPoint).filter((v): v is BinPoint => v !== null);
    if (mapped.length > 0) return mapped;
    // أو مصفوفة عناصرها كائنات فيها bins بداخلها (نادر)
    return [];
  }

  const r = x as Record<string, unknown>;

  // لو فيه مفتاح bins مباشرة
  if (Array.isArray(r.bins)) {
    const m = r.bins
      .map(toBinPoint)
      .filter((v): v is BinPoint => v !== null);
    if (m.length > 0) return m;
  }

  // أسماء شائعة: data.bins / result.bins / payload.bins
  for (const key of ["data", "result", "payload", "pair", "pool"]) {
    const child = r[key];
    if (child) {
      const found = findBinsDeep(child, depth + 1);
      if (found.length > 0) return found;
    }
  }

  // فحص بقية المفاتيح (ملاذ أخير)
  for (const [_, val] of Object.entries(r)) {
    const found = findBinsDeep(val, depth + 1);
    if (found.length > 0) return found;
  }

  return [];
}

const REVALIDATE_SECONDS = 20;

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);

  const networkRaw = (searchParams.get("network") || "devnet").toLowerCase();
  const network: "devnet" | "mainnet" =
    networkRaw === "mainnet" ? "mainnet" : "devnet";

  const poolRaw = (searchParams.get("pool") || DEFAULT_DEVNET_POOL).trim();
  const pool = isBase58Pubkey(poolRaw) ? poolRaw : DEFAULT_DEVNET_POOL;

  const HOST =
    network === "devnet"
      ? "https://devnet-dlmm-api.meteora.ag"
      : "https://dlmm-api.meteora.ag";

  // نجرب أكثر من مسار وبنى مختلفة (كائن أو مصفوفة)
  const candidates = [
    `${HOST}/pools/${pool}/bins?network=${network}`,
    `${HOST}/pair/${pool}/bins?network=${network}`,
    `${HOST}/pair/${pool}?network=${network}`, // بعض الإصدارات ترجع كائن فيه bins
    `${HOST}/pools/bins?address=${pool}&network=${network}`,
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

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

        // 1) لو كانت مصفوفة مباشرة
        let mapped: BinPoint[] = [];
        if (Array.isArray(data)) {
          mapped = data
            .map(toBinPoint)
            .filter((v): v is BinPoint => v !== null);
        } else {
          // 2) ابحث عن bins بعمق داخل الكائن
          mapped = findBinsDeep(data);
        }

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
        reason: err instanceof Error ? err.message : "fetch-failed",
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
