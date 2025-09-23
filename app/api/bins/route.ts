// app/api/bins/route.ts
import { NextResponse } from "next/server";
import { fetchDemoBins } from "../../../lib/dlmmClient";

type BinPoint = { price: number; liquidity: number };

type PairLite = {
  address: string;
  tokenX?: string;
  tokenY?: string;
  symbol?: string;
  // قد لا تتوفر دائمًا:
  binStep?: number;
  activeId?: number;
  currentPrice?: number;
};

type UpTry = { url: string; status?: number; err?: string; bins?: number };

const DEFAULT_DEVNET_POOL = "11111111111111111111111111111111";
const REVALIDATE_SECONDS = 20;

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

async function tryJson(url: string): Promise<{ ok: boolean; status: number; data?: unknown }> {
  const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  const status = res.status;
  if (!res.ok) return { ok: false, status };
  try {
    const data = (await res.json()) as unknown;
    return { ok: true, status, data };
  } catch {
    return { ok: false, status };
  }
}

/** يحاول جلب بيانات bins من REST. يرجع BinPoint[] أو null */
async function fetchBinsFromRest(pool: string): Promise<{
  bins: BinPoint[] | null;
  tried: UpTry[];
}> {
  const tried: UpTry[] = [];
  const base = "https://devnet-dlmm-api.meteora.ag";

  // 1) محاولات مباشرة (في بعض الإصدارات قد توجد)
  const candidatesDirect = [
    `${base}/pools/${pool}/bins?network=devnet`,
    `${base}/pair/${pool}/bins?network=devnet`,
    `${base}/pair/${pool}?network=devnet`,
    `${base}/pools/bins?address=${pool}&network=devnet`,
    // cluster بدلاً من network
    `${base}/pools/${pool}/bins?cluster=devnet`,
    `${base}/pair/${pool}/bins?cluster=devnet`,
    `${base}/pair/${pool}?cluster=devnet`,
    `${base}/pools/bins?address=${pool}&cluster=devnet`,
  ];

  for (const url of candidatesDirect) {
    try {
      const res = await tryJson(url);
      tried.push({ url, status: res.status });
      if (!res.ok || !res.data) continue;

      // إذا كانت مصفوفة تحوي price/liquidity مباشرة
      if (Array.isArray(res.data)) {
        const bins = res.data
          .map((x) => extractBin(x))
          .filter((x): x is BinPoint => x !== null);
        if (bins.length > 0) {
          bins.sort((a, b) => a.price - b.price);
          return { bins, tried };
        }
      }

      // لو كان كائن فيه حقل bins كمصفوفة
      if (
        res.data &&
        typeof res.data === "object" &&
        Array.isArray((res.data as Record<string, unknown>).bins)
      ) {
        const raw = (res.data as Record<string, unknown>).bins as unknown[];
        const bins = raw
          .map((x) => extractBin(x))
          .filter((x): x is BinPoint => x !== null);
        if (bins.length > 0) {
          bins.sort((a, b) => a.price - b.price);
          return { bins, tried };
        } else {
          // سجّل أن الرد يحوي bins=0
          tried[tried.length - 1].bins = 0;
        }
      }
    } catch (e) {
      tried.push({ url, err: (e as Error).message });
    }
  }

  // 2) قائمة كل الأزواج للعثور على المسبح المطلوب (قد نستفيد لاحقًا)
  const listUrl = `${base}/pair/all`;
  try {
    const res = await tryJson(listUrl);
    tried.push({ url: listUrl, status: res.status });
    if (res.ok && Array.isArray(res.data)) {
      const list = res.data as unknown[];
      const match = list.find((it) => {
        if (!it || typeof it !== "object") return false;
        const address =
          typeof (it as Record<string, unknown>).address === "string"
            ? ((it as Record<string, unknown>).address as string)
            : "";
        return address === pool;
      });
      if (!match) {
        tried.push({ url: listUrl, err: "pool-not-found-in-list" });
      } else {
        // بعض واجهات REST لا تعيد bins مباشرة — نكتفي بإثبات الوجود
        // ونترك مهمة جلب التوزيع للـ SDK لاحقًا. الآن سنرجع null ليتم استخدام fallback.
      }
    }
  } catch (e) {
    tried.push({ url: listUrl, err: (e as Error).message });
  }

  return { bins: null, tried };
}

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const pool = (searchParams.get("pool") || DEFAULT_DEVNET_POOL).trim() || DEFAULT_DEVNET_POOL;

  // network ثابت هنا Devnet (يمكن لاحقًا دعم mainnet)
  const network = "devnet" as const;

  // (أ) جرّب REST أولًا
  const rest = await fetchBinsFromRest(pool);

  if (rest.bins && rest.bins.length > 0) {
    return NextResponse.json(
      {
        source: "upstream",
        network,
        pool,
        bins: rest.bins,
        binsCount: rest.bins.length,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": `max-age=0, s-maxage=${REVALIDATE_SECONDS}`,
          "x-origin": origin,
        },
      }
    );
  }

  // (ب) لم ننجح — ارجع ديمو نظيف بدل كسر الواجهة
  const demo = await fetchDemoBins();
  return NextResponse.json(
    {
      source: "fallback-demo",
      reason: "no-upstream-candidate-worked",
      network,
      pool,
      bins: demo,
      binsCount: demo.length,
      updatedAt: new Date().toISOString(),
      upstreamTried: rest.tried,
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
