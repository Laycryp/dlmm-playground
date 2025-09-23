// app/api/bins/route.ts
import { NextResponse } from "next/server";
import DLMM from "@meteora-ag/dlmm";
import { Connection, PublicKey, clusterApiUrl, Cluster } from "@solana/web3.js";
import { fetchDemoBins } from "../../../lib/dlmmClient";

type BinPoint = { price: number; liquidity: number };

const DEFAULT_DEVNET_POOL =
  process.env.DLMM_DEVNET_POOL?.trim() ||
  "35pqwzfx5qbifizJhe9VjuMJMV3Ut8bVHyn4nZvmC25R";

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

  const price =
    toNumber(r.price) ??
    toNumber(r.pricePerLamport) ??
    toNumber(r.binPrice) ??
    toNumber((r as Record<string, unknown>)["p"]);

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

/** يحوّل قيمة network القادمة من الكويري إلى Cluster صالح للـ SDK */
function toCluster(networkRaw: string): Cluster | "localhost" {
  const n = networkRaw.toLowerCase();
  if (n === "mainnet" || n === "mainnet-beta") return "mainnet-beta";
  if (n === "testnet") return "testnet";
  if (n === "localhost") return "localhost";
  return "devnet";
}

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);

  const networkRaw = (searchParams.get("network") || "devnet").toLowerCase();
  const cluster: Cluster | "localhost" = toCluster(networkRaw);

  const poolRaw = (searchParams.get("pool") || DEFAULT_DEVNET_POOL).trim();
  const pool = isBase58Pubkey(poolRaw) ? poolRaw : DEFAULT_DEVNET_POOL;

  // RPC مناسب لكل شبكة
  const rpc =
    cluster === "devnet"
      ? process.env.SOLANA_RPC_DEVNET || clusterApiUrl("devnet")
      : cluster === "testnet"
      ? process.env.SOLANA_RPC_TESTNET || clusterApiUrl("testnet")
      : cluster === "localhost"
      ? process.env.SOLANA_RPC_LOCALHOST || "http://127.0.0.1:8899"
      : process.env.SOLANA_RPC_MAINNET || clusterApiUrl("mainnet-beta");

  const radius = Math.max(
    5,
    Math.min(100, Number(searchParams.get("radius") || "25"))
  );

  try {
    const connection = new Connection(rpc, "confirmed");
    const dlmm = await DLMM.create(connection, new PublicKey(pool), {
      cluster, // ← الآن نوع متوافق: "devnet" | "testnet" | "mainnet-beta" | "localhost"
    });

    // 1) جرّب حول الـ active bin
    const aroundUnknown: unknown = await dlmm.getBinsAroundActiveBin({
      numberOfBins: radius,
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
          network: cluster,
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

    // 2) بديل: getBinArrays
    const arraysUnknown: unknown = await dlmm.getBinArrays();
    const fromArrays =
      Array.isArray(arraysUnknown)
        ? (arraysUnknown
            .flatMap((arrItem) => {
              if (!arrItem || typeof arrItem !== "object") return [];
              const rr = arrItem as Record<string, unknown>;
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
          network: cluster,
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

    // 3) لو لم نجد شيئًا — رجوع للديمو
    const demo = await fetchDemoBins();
    return NextResponse.json(
      {
        source: "fallback-demo",
        reason: "sdk-returned-empty",
        network: cluster,
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
        reason: err instanceof Error ? err.message : "sdk-failed",
        network: cluster,
        pool,
        bins: demo,
        binsCount: demo.length,
        updatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
