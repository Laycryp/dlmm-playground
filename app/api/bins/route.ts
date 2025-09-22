// app/api/bins/route.ts
import { NextResponse } from "next/server";
import { fetchDemoBins } from "../../../lib/dlmmClient"; // ← مسار نسبي صحيح

type AnyJson = Record<string, unknown> | unknown[] | null;

const DEFAULT_DEVNET_POOL =
  // ضع هنا عنوان Devnet حقيقي عندما يتوفر لديك
  "11111111111111111111111111111111";

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
    // لو عندك endpoint مؤكد، استبدل URL أدناه ثم اضبط mapping تحت.
    const apiUrl = `https://dlmm-api.meteora.ag/pools/${pool}/bins?network=devnet`;

    const res = await fetch(apiUrl, {
      next: { revalidate: revalidateSeconds },
    });

    if (!res.ok) {
      throw new Error(`Upstream returned ${res.status}`);
    }

    const data: AnyJson = await res.json();

    // ===== Mapping مرن للـ bins القادمة من المزود =====
    let bins = Array.isArray(data)
      ? data
          .map((d: any) => {
            const price =
              typeof d?.price === "number"
                ? d.price
                : typeof d?.binPrice === "number"
                ? d.binPrice
                : typeof d?.p === "number"
                ? d.p
                : null;

            const liqRaw =
              typeof d?.liquidity === "number"
                ? d.liquidity
                : typeof d?.binLiquidity === "number"
                ? d.binLiquidity
                : typeof d?.l === "number"
                ? d.l
                : null;

            if (price == null || liqRaw == null) return null;

            const liquidity = Math.max(0, Number(liqRaw));
            return { price: Number(price), liquidity };
          })
          .filter(Boolean)
      : [];

    if (!bins.length) throw new Error("Empty/unknown upstream shape");

    bins.sort((a: any, b: any) => a.price - b.price);

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
    const demo = await fetchDemoBins();
    return NextResponse.json(
      {
        source: "fallback-demo",
        pool,
        bins: demo,
        error:
          err instanceof Error ? err.message : "Failed to fetch pool bins",
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
