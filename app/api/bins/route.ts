// app/api/bins/route.ts
import { NextResponse } from "next/server";
import DLMM from "@meteora-ag/dlmm";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { fetchDemoBins } from "../../../lib/dlmmClient";

type BinPoint = { price: number; liquidity: number };

const DEFAULT_DEVNET_POOL =
  process.env.DLMM_DEVNET_POOL?.trim() ||
  "35pqwzfx5qbifizJhe9VjuMJMV3Ut8bVHyn4nZvmC25R"; // العنوان الذي زوّدتني به

const REVALIDATE_SECONDS = 15;

function isBase58Pubkey(s: string): boolean {
  const base58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return s.length >= 30 && s.length <= 60 && base58.test(s);
}

function toNumber(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

function binFromSdk(obj: unknown): BinPoint | null {
  if (!obj || typeof obj !== "object") return null;
  const r = obj as Record<string, unknown>;

  // السعر قد يأتي باسم price أو pricePerLamport أو binPrice … نعالج أشهر الأسماء
  const price =
    toNumber(r.price) ??
    toNumber(r.pricePerLamport) ??
    toNumber(r.binPrice) ??
    toNumber((r as Record<string, unknown>)["p"]);

  // السيولة: بعض الدوال ترجّع amountX/amountY، وأحيانًا totalLiquidity
  const lx =
    toNumber(r.amountX) ??
    toNumber((r as Record<string, unknown>)["xAmount"]) ??
    toNumber((r as Record<string, unknown>)["x"]);
  const ly =
    toNumber(r.amountY) ??
    toNumber((r as Record<string, unknown>)["yAmount"]) ??
    toNumber((r as Record<string, unknown>)["y"]);
  const liquidity =
    toNumber(r.liquidity) ??
    (lx !== undefined || ly !== undefined ? (lx ?? 0) + (ly ?? 0) : undefined);

  if (price === undefined || liquidity === undefined) return null;

  return { price, liquidity: Math.max(0, liquidity) };
}

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);

  const networkRaw = (searchParams.get("network") || "devnet").toLowerCase();
  const network: "devnet" | "mainnet" =
    networkRaw === "mainnet" ? "mainnet" : "devnet";

  const poolRaw = (searchParams.get("pool") || DEFAULT_DEVNET_POOL).trim();
  const pool = isBase58Pubkey(poolRaw) ? poolRaw : DEFAULT_DEVNET_POOL;

  // RPC مناسب لـ Vercel
  const rpc =
    network === "devnet"
      ? process.env.SOLANA_RPC_DEVNET || clusterApiUrl("devnet")
      : process.env.SOLANA_RPC_MAINNET ||
        "https://api.mainnet-beta.solana.com";

  const radius =
    Number(searchParams.get("radius") || "25"); // كم bin حول الـ active

  try {
    const connection = new Connection(rpc, "confirmed");
    const dlmm = await DLMM.create(connection, new PublicKey(pool), {
      cluster: network,
    });

    // جرّب أولًا Bins حول الـ active bin
    const aroundUnknown: unknown = await dlmm.getBinsAroundActiveBin({
      numberOfBins: Math.max(5, Math.min(100, radius)),
    });

    const mappedA = Array.isArray(aroundUnknown)
      ? (aroundUnknown
          .map((x) => binFromSdk(x))
          .filter((x): x is BinPoint => x !== null) as BinPoint[])
      : [];

    if (mappedA.length > 0) {
      const binsSorted = [...mappedA].sort((a, b) => a.price - b.price);
      return NextResponse.json(
        {
          source: "upstream-sdk",
          method: "getBinsAroundActiveBin",
          network,
          pool,
          bins: binsSorted,
          binsCount: binsSorted.length,
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

    // بديل: إن ما رجّع شيء، جرّب getBinArrays (قد تحتاجه لبعض المسابح)
    const arraysUnknown: unknown = await dlmm.getBinArrays();
    const fromArrays =
      Array.isArray(arraysUnknown)
        ? (arraysUnknown
            .flatMap((arrItem) => {
              if (!arrItem || typeof arrItem !== "object") return [];
              const rr = arrItem as Record<string, unknown>;
              // حاول تلقّط أي مصفوفة داخلية اسمها bins/entries/… إلخ
              const candidates = [
                rr.bins,
                (rr as Record<string, unknown>)["entries"],
                (rr as Record<string, unknown>)["items"],
              ].filter((c) => Array.isArray(c)) as unknown[][];
              return candidates.flat();
            })
            .map((x) => binFromSdk(x))
            .filter((x): x is BinPoint => x !== null) as BinPoint[])
        : [];

    if (fromArrays.length > 0) {
      const binsSorted = [...fromArrays].sort((a, b) => a.price - b.price);
      return NextResponse.json(
        {
          source: "upstream-sdk",
          method: "getBinArrays",
          network,
          pool,
          bins: binsSorted,
          binsCount: binsSorted.length,
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

    // لو ما قدرنا نستخرج — fallback ديمو
    const demo = await fetchDemoBins();
    return NextResponse.json(
      {
        source: "fallback-demo",
        reason: "sdk-returned-empty",
        network,
        pool,
        bins: demo,
        binsCount: demo.length,
        updatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const demo = await fetchDemoBins();
    return NextResponse.json(
      {
        source: "fallback-demo",
        reason:
          err instanceof Error ? err.message : "sdk-failed",
        network,
        pool,
        bins: demo,
        binsCount: demo.length,
        updatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
