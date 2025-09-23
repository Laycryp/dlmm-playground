// app/api/bins/route.ts
import { NextResponse } from "next/server";
import DLMM from "@meteora-ag/dlmm";
import { Connection, PublicKey, clusterApiUrl, Cluster } from "@solana/web3.js";
import { fetchDemoBins } from "../../../lib/dlmmClient";

type BinPoint = { price: number; liquidity: number };

// افتراضي Devnet
const DEFAULT_DEVNET_POOL =
  process.env.DLMM_DEVNET_POOL?.trim() ||
  "35pqwzfx5qbifizJhe9VjuMJMV3Ut8bVHyn4nZvmC25R";

const REVALIDATE_SECONDS = 15;

function isBase58Pubkey(s: string): boolean {
  const base58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return s.length >= 30 && s.length <= 60 && base58.test(s);
}

function toCluster(networkRaw: string): Cluster | "localhost" {
  const n = networkRaw.toLowerCase();
  if (n === "mainnet" || n === "mainnet-beta") return "mainnet-beta";
  if (n === "testnet") return "testnet";
  if (n === "localhost") return "localhost";
  return "devnet";
}

function toNumber(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

function mapSdkBin(x: unknown): BinPoint | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;

  // السعر يمكن أن يأتي بأسماء مختلفة
  const price =
    toNumber(r.price) ??
    toNumber((r as Record<string, unknown>)["binPrice"]) ??
    toNumber((r as Record<string, unknown>)["p"]) ??
    toNumber((r as Record<string, unknown>)["pricePerLamport"]);

  // السيولة قد تأتي X/Y أو إجمالي
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

  // الشبكة
  const networkRaw = (searchParams.get("network") || "devnet").toLowerCase();
  const cluster: Cluster | "localhost" = toCluster(networkRaw);

  // المسبح
  const poolRaw = (searchParams.get("pool") || DEFAULT_DEVNET_POOL).trim();
  const pool = isBase58Pubkey(poolRaw) ? poolRaw : DEFAULT_DEVNET_POOL;

  // نصف القطر حول الـ active bin
  const radius = Math.max(
    5,
    Math.min(100, Number(searchParams.get("radius") || "25"))
  );

  // RPC لكل شبكة
  const rpc =
    cluster === "devnet"
      ? process.env.SOLANA_RPC_DEVNET || clusterApiUrl("devnet")
      : cluster === "testnet"
      ? process.env.SOLANA_RPC_TESTNET || clusterApiUrl("testnet")
      : cluster === "localhost"
      ? process.env.SOLANA_RPC_LOCALHOST || "http://127.0.0.1:8899"
      : process.env.SOLANA_RPC_MAINNET || clusterApiUrl("mainnet-beta");

  try {
    const connection = new Connection(rpc, "confirmed");
    // 1) أنشئ كائن DLMM من عنوان المسبح
    const dlmm = await DLMM.create(connection, new PublicKey(pool), {
      cluster,
    });

    // 2) احصل على الـ active bin للحصول على binId
    const active = await dlmm.getActiveBin();
    // غالبًا الحقل binId أو activeBinId (نغطي الاحتمالين)
    const activeId =
      (active as Record<string, unknown>)["binId"] ??
      (active as Record<string, unknown>)["activeBinId"];
    if (typeof activeId !== "number" || !Number.isFinite(activeId)) {
      throw new Error("could-not-read-active-bin-id");
    }

    // 3) احصل على مجموعة من الـ bins حول الـ active
    // ملاحظة: توقيع الدالة في SDK يتطلب (activeBinId, numberOfBins)
    const aroundUnknown: unknown = await dlmm.getBinsAroundActiveBin(
      activeId as number,
      radius
    );

    const bins =
      Array.isArray(aroundUnknown)
        ? (aroundUnknown
            .map((b) => mapSdkBin(b))
            .filter((b): b is BinPoint => b !== null) as BinPoint[])
        : [];

    if (bins.length > 0) {
      bins.sort((a, b) => a.price - b.price);
      return NextResponse.json(
        {
          source: "upstream-sdk",
          network: cluster,
          pool,
          bins,
          binsCount: bins.length,
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

    // 4) إن لم يعدّ شيئًا — جرب getBinArrays كبديل
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
            .map((x) => mapSdkBin(x))
            .filter((x): x is BinPoint => x !== null) as BinPoint[])
        : [];

    if (fromArrays.length > 0) {
      const sorted = [...fromArrays].sort((a, b) => a.price - b.price);
      return NextResponse.json(
        {
          source: "upstream-sdk",
          method: "getBinArrays",
          network: cluster,
          pool,
          bins: sorted,
          binsCount: sorted.length,
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

    // 5) fallback لو لم ينجح أي مسار
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
