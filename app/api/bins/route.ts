// app/api/bins/route.ts
import { NextResponse } from "next/server";
import { fetchDemoBins } from "../../../lib/dlmmClient";

/** شكل العنصر النهائي الذي تعيده الـ API لواجهة الرسم */
type BinPoint = { price: number; liquidity: number };

/** عنوان Devnet افتراضي (بدّله عندما يتوفر عندك عنوان حقيقي) */
const DEFAULT_DEVNET_POOL = "11111111111111111111111111111111";

/** استخراج price/liquidity من أي شكل معروف شائع */
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

/**
 * نحاول إحضار الـ bins من API عام (مثال Meteora DLMM).
 * إن فشلنا لأي سبب: نرجع fallback (demo bins) حتى لا تنكسر الواجهة.
 */
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const pool = (searchParams.get("pool") || DEFAULT_DEVNET_POOL).trim();

  // (اختياري) revalidate بسيط للتقليل من الضغط
  const revalidateSeconds = 20;

  try {
    // مثال لنقطة نهاية عامة – قد تختلف بحسب مزود الـ DLMM
    const apiUrl = `https://dlmm-api.meteora.ag/pools/${pool}/bins?network=devnet`;

    const res = await fetch(apiUrl, {
      next: { revalidate: revalidateSeconds },
    });

    if (!res.ok) {
      throw new Error(`Upstream returned ${res.status}`);
    }

    const data: unknown = await res.json();

    // نحاول تحويل استجابة المزود إلى مصفوفة BinPoint[]
    const bins: BinPoint[] = Array.isArray(data)
      ? (data
          .map((item) => extractBin(item))
          .filter((x): x is BinPoint => x !== null) as BinPoint[])
      : [];

    if (bins.length === 0) throw new Error("Empty/unknown upstream shape");

    // ترتيب حسب السعر
    bins.sort((a, b) => a.price - b.price);

    return NextResponse.json(
      { source: "upstream", pool, bins },
      {
        headers: {
          "Cache-Control": `max-age=0, s-maxage=${revalidateSeconds}`,
          "x-origin": origin,
        },
      }
    );
  } catch (err) {
    // Fallback — الديمو
    const demo = await fetchDemoBins();
    return NextResponse.json(
      {
        source: "fallback-demo",
        pool,
        bins: demo,
        error: err instanceof Error ? err.message : "Failed to fetch pool bins",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "x-fallback": "true",
        },
      }
    );
  }
}
