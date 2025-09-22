// app/api/bins/route.ts
import { NextResponse } from "next/server";
import { fetchDemoBins } from "../../../lib/dlmmClient";

/** العنصر النهائي الذي تعيده الـ API لواجهة الرسم */
type BinPoint = { price: number; liquidity: number };

/** قراءة العنوان الافتراضي من البيئة (إن لم يوجد نستخدم قيمة placeholder) */
const DEFAULT_DEVNET_POOL =
  process.env.DLMM_DEVNET_POOL?.trim() || "11111111111111111111111111111111";

/** إعدادات عامة */
const REVALIDATE_SECONDS = 20;
const UPSTREAM_BASE = "https://dlmm-api.meteora.ag";

/** تحقق بسيط لعنوان base58 بطول منطقي (لـ UI/API) */
function isBase58Pubkey(s: string): boolean {
  const base58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return s.length >= 30 && s.length <= 50 && base58.test(s);
}

/** استخراج price/liquidity من أشكال شائعة */
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

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);

  // network اختياري: devnet | mainnet (افتراضي devnet)
  const networkRaw = (searchParams.get("network") || "devnet").toLowerCase();
  const network: "devnet" | "mainnet" = networkRaw === "mainnet" ? "mainnet" : "devnet";

  // العنوان المطلوب أو الافتراضي
  const poolRaw = (searchParams.get("pool") || DEFAULT_DEVNET_POOL).trim();
  const pool = isBase58Pubkey(poolRaw) ? poolRaw : DEFAULT_DEVNET_POOL;

  // في حال كان الإدخال غير صالح بالكامل نرجّع فورًا الديمو مع سبب واضح
  if (!isBase58Pubkey(poolRaw)) {
    const demo = await fetchDemoBins();
    return NextResponse.json(
      {
        source: "fallback-demo",
        reason: "invalid-pool-address",
        pool: DEFAULT_DEVNET_POOL,
        network,
        bins: demo,
        binsCount: demo.length,
        updatedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "x-origin": origin,
        },
      }
    );
  }

  // طلب upstream مع مهلة
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const apiUrl = `${UPSTREAM_BASE}/pools/${pool}/bins?network=${network}`;

    const res = await fetch(apiUrl, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Upstream returned ${res.status}`);
    }

    const data: unknown = await res.json();

    // تحويل الاستجابة إلى BinPoint[]
    const bins: BinPoint[] = Array.isArray(data)
      ? (data
          .map((item) => extractBin(item))
          .filter((x): x is BinPoint => x !== null) as BinPoint[])
      : [];

    if (bins.length === 0) throw new Error("Empty/unknown upstream shape");

    bins.sort((a, b) => a.price - b.price);

    return NextResponse.json(
      {
        source: "upstream",
        pool,
        network,
        bins,
        binsCount: bins.length,
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
    // Fallback — الديمو عند الفشل
    const demo = await fetchDemoBins();
    return NextResponse.json(
      {
        source: "fallback-demo",
        reason:
          err instanceof Error ? err.message : "Failed to fetch pool bins",
        pool,
        network,
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
