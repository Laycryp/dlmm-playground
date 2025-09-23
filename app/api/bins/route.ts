// app/api/bins/route.ts
import { NextResponse } from "next/server";
import DLMM from "@meteora-ag/dlmm";
import { Connection, PublicKey, clusterApiUrl, Cluster } from "@solana/web3.js";
import { fetchDemoBins } from "../../../lib/dlmmClient";

type BinPoint = { price: number; liquidity: number };

const DEFAULT_MAINNET_POOL =
  process.env.DLMM_MAINNET_POOL?.trim() ||
  // ضع مسبحًا معروفًا إن رغبت. نتركه فارغًا ليملأه المستخدم من الواجهة.
  "11111111111111111111111111111111";

const REVALIDATE_SECONDS = 15;

function isBase58Pubkey(s: string): boolean {
  const base58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return s.length >= 30 && s.length <= 60 && base58.test(s);
}
function toCluster(networkRaw: string): Cluster | "localhost" {
  const n = networkRaw.toLowerCase();
  if (n === "devnet") return "devnet";
  if (n === "testnet") return "testnet";
  if (n === "localhost") return "localhost";
  return "mainnet-beta";
}
function baseUrl(network: string) {
  return network.toLowerCase() === "devnet"
    ? "https://devnet-dlmm-api.meteora.ag"
    : "https://dlmm-api.meteora.ag";
}
function toNumber(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}
function mapSdkBin(x: unknown): BinPoint | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  const price =
    toNumber(r.price) ??
    toNumber(r.binPrice) ??
    toNumber((r as Record<string, unknown>)["p"]) ??
    toNumber((r as Record<string, unknown>)["pricePerLamport"]);
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

function generateSyntheticBins(centerPrice: number, binStepPct = 0.45, count = 41): BinPoint[] {
  const half = Math.floor(count / 2);
  const sigma = half / 2.2;
  const bins: BinPoint[] = [];
  for (let i = -half; i <= half; i++) {
    const price = centerPrice * Math.pow(1 + binStepPct / 100, i);
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
    const liquidity = Math.round(100 * weight);
    bins.push({ price: Number(price.toFixed(4)), liquidity });
  }
  return bins.sort((a, b) => a.price - b.price);
}

async function tryJson(url: string) {
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

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);

  const network = (searchParams.get("network") || "mainnet").toLowerCase();
  const cluster: Cluster | "localhost" = toCluster(network);

  const rawPool = (searchParams.get("pool") || DEFAULT_MAINNET_POOL).trim();
  const pool = isBase58Pubkey(rawPool) ? rawPool : DEFAULT_MAINNET_POOL;

  const radius = Math.max(5, Math.min(120, Number(searchParams.get("radius") || "40")));

  const rpc =
    cluster === "devnet"
      ? process.env.SOLANA_RPC_DEVNET || clusterApiUrl("devnet")
      : cluster === "testnet"
      ? process.env.SOLANA_RPC_TESTNET || clusterApiUrl("testnet")
      : cluster === "localhost"
      ? process.env.SOLANA_RPC_LOCALHOST || "http://127.0.0.1:8899"
      : process.env.SOLANA_RPC_MAINNET || clusterApiUrl("mainnet-beta");

  try {
    // 1) SDK أولًا
    const connection = new Connection(rpc, "confirmed");
    const dlmm = await DLMM.create(connection, new PublicKey(pool), { cluster });

    const active = await dlmm.getActiveBin();
    const activeId =
      (active as Record<string, unknown>)["binId"] ??
      (active as Record<string, unknown>)["activeBinId"];

    let bins: BinPoint[] = [];

    if (typeof activeId === "number" && Number.isFinite(activeId)) {
      const aroundUnknown: unknown = await dlmm.getBinsAroundActiveBin(activeId, radius);
      if (Array.isArray(aroundUnknown)) {
        bins = aroundUnknown.map(mapSdkBin).filter((b): b is BinPoint => b !== null);
      }
    }

    if (bins.length === 0) {
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
              .map(mapSdkBin)
              .filter((x): x is BinPoint => x !== null) as BinPoint[])
          : [];
      bins = fromArrays;
    }

    if (bins.length > 0) {
      bins.sort((a, b) => a.price - b.price);
      return NextResponse.json(
        {
          source: "upstream-sdk",
          network,
          pool,
          bins,
          binsCount: bins.length,
          updatedAt: new Date().toISOString(),
        },
        { headers: { "Cache-Control": `max-age=0, s-maxage=${REVALIDATE_SECONDS}`, "x-origin": origin } }
      );
    }

    // 2) REST mainnet -> توليد bins تركيبية حول السعر الحقيقي
    const api = baseUrl(network);
    const rest = await tryJson(`${api}/pair/${pool}?network=mainnet`);
    if (rest.ok && rest.data && typeof rest.data === "object") {
      const r = rest.data as Record<string, unknown>;
      const currentPrice = toNumber(r.currentPrice);
      const binStep = toNumber(r.binStep) ?? 0.45;
      if (currentPrice && currentPrice > 0) {
        const synthetic = generateSyntheticBins(currentPrice, binStep, 41);
        return NextResponse.json(
          {
            source: "synthetic-from-rest",
            network,
            pool,
            centerPrice: currentPrice,
            binStepPct: binStep,
            bins: synthetic,
            binsCount: synthetic.length,
            updatedAt: new Date().toISOString(),
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    // 3) fallback أخيرًا
    const demo = await fetchDemoBins();
    return NextResponse.json(
      { source: "fallback-demo", reason: "sdk-returned-empty", network, pool, bins: demo, binsCount: demo.length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const demo = await fetchDemoBins();
    return NextResponse.json(
      { source: "fallback-demo", reason: err instanceof Error ? err.message : "sdk-failed", network, pool, bins: demo },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
