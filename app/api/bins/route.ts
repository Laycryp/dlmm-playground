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
  if (depth > 6 || x == null || typeof x !== "object") return [];

  if (Array.isArray(x)) {
    const mapped = x.map(toBinPoint).filter((v): v is BinPoint => v !== null);
    if (mapped.length > 0) return mapped;
    return [];
  }

  const r = x as Record<string, unknown>;

  const binKeys = ["bins", "Bins", "liquidityBins"];
  for (const k of binKeys) {
    const maybe = r[k];
    if (Array.isArray(maybe)) {
      const mapped = maybe
        .map(toBinPoint)
        .filter((v): v is BinPoint => v !== null);
      if (mapped.length > 0) return mapped;
    }
  }

  const containerKeys = ["data", "result", "payload", "pair", "pool", "info"];
  for (const k of containerKeys) {
    const child = r[k];
    if (child) {
      const found = findBinsDeep(child, depth + 1);
      if (found.length > 0) return found;
    }
  }

  for (const [, val] of Object.entries(r)) {
    const found = findBinsDeep(val, depth + 1);
    if (found.length > 0) return found;
  }

  return [];
}

const REVALIDATE_SECONDS = 20;

/** قراءة حقل نصّي آمن من كائن غير معروف */
function readStringField(
  obj: unknown,
  keys: string[]
): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const r = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string") return v;
  }
  return undefined;
}

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

  // مسارات مرشّحة + بدائل cluster/network شائعة
  const candidates: string[] = [
    `${HOST}/pools/${pool}/bins?network=${network}`,
    `${HOST}/pair/${pool}/bins?network=${network}`,
    `${HOST}/pair/${pool}?network=${network}`,
    `${HOST}/pools/bins?address=${pool}&network=${network}`,
    // بعض الإصدارات تستخدم cluster:
    `${HOST}/pools/${pool}/bins?cluster=${network}`,
    `${HOST}/pair/${pool}/bins?cluster=${network}`,
    `${HOST}/pair/${pool}?cluster=${network}`,
    `${HOST}/pools/bins?address=${pool}&cluster=${network}`,
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  const debug: Array<{ url: string; status?: number; bins?: number; err?: string }> =
    [];

  try {
    if (!isBase58Pubkey(poolRaw)) {
      throw new Error("invalid-pool-address");
    }

    // 1) جرّب المسارات المرشّحة
    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          next: { revalidate: REVALIDATE_SECONDS },
          signal: controller.signal,
        });
        const entry: (typeof debug)[number] = { url, status: res.status };
        if (!res.ok) {
          debug.push(entry);
          continue;
        }

        const data: unknown = await res.json();
        const mapped =
          Array.isArray(data) && data.length
            ? (data
                .map(toBinPoint)
                .filter((v): v is BinPoint => v !== null) as BinPoint[])
            : findBinsDeep(data);

        entry.bins = mapped.length;
        debug.push(entry);

        if (mapped.length > 0) {
          mapped.sort((a, b) => a.price - b.price);
          return NextResponse.json(
            {
              source: "upstream",
              network,
              pool,
              bins: mapped,
              binsCount: mapped.length,
              upstreamTried: debug,
              updatedAt: new Date().toISOString(),
            },
            {
              headers: {
                "Cache-Control": `max-age=0, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=30`,
                "x-origin": origin,
              },
            }
          );
        }
      } catch (e) {
        debug.push({ url, err: e instanceof Error ? e.message : "fetch-error" });
        // جرّب التالي
      }
    }

    // 2) ملاذ أخير: pair/all → ثم pair/{pool}
    try {
      const allUrl = `${HOST}/pair/all`;
      const resAll = await fetch(allUrl, {
        next: { revalidate: REVALIDATE_SECONDS },
        signal: controller.signal,
      });
      debug.push({ url: allUrl, status: resAll.status });

      if (resAll.ok) {
        const listUnknown: unknown = await resAll.json();
        const arr: unknown[] = Array.isArray(listUnknown) ? listUnknown : [];

        const match = arr.find((it: unknown) => {
          const addr = readStringField(it, [
            "address",
            "pairAddress",
            "pool_address",
          ]);
          return addr === pool;
        });

        if (match) {
          // لو العنصر نفسه يحوي bins
          const fromMatch = findBinsDeep(match);
          if (fromMatch.length > 0) {
            const bins = [...fromMatch].sort((a, b) => a.price - b.price);
            debug.push({ url: allUrl + " (inline-bins)", bins: bins.length });
            return NextResponse.json(
              {
                source: "upstream",
                network,
                pool,
                bins,
                binsCount: bins.length,
                upstreamTried: debug,
                updatedAt: new Date().toISOString(),
              },
              {
                headers: {
                  "Cache-Control": `max-age=0, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=30`,
                  "x-origin": origin,
                },
              }
            );
          }

          // تفاصيل الزوج
          const detailUrlA = `${HOST}/pair/${pool}?network=${network}`;
          const resDetail = await fetch(detailUrlA, {
            next: { revalidate: REVALIDATE_SECONDS },
            signal: controller.signal,
          });
          debug.push({ url: detailUrlA, status: resDetail.status });

          if (resDetail.ok) {
            const detail: unknown = await resDetail.json();
            const fromDetail = findBinsDeep(detail);
            if (fromDetail.length > 0) {
              const bins = [...fromDetail].sort((a, b) => a.price - b.price);
              return NextResponse.json(
                {
                  source: "upstream",
                  network,
                  pool,
                  bins,
                  binsCount: bins.length,
                  upstreamTried: debug,
                  updatedAt: new Date().toISOString(),
                },
                {
                  headers: {
                    "Cache-Control": `max-age=0, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=30`,
                    "x-origin": origin,
                  },
                }
              );
            }
          }
        } else {
          debug.push({ url: allUrl, err: "pool-not-found-in-list" });
        }
      }
    } catch (e) {
      debug.push({
        url: `${HOST}/pair/all`,
        err: e instanceof Error ? e.message : "fetch-error",
      });
    }

    // 3) فشل — ارجع للديمو مع debug
    const demo = await fetchDemoBins();
    return NextResponse.json(
      {
        source: "fallback-demo",
        reason: "no-upstream-candidate-worked",
        network,
        pool,
        bins: demo,
        binsCount: demo.length,
        upstreamTried: debug,
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
        upstreamTried: debug,
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
