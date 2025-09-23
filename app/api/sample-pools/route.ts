// app/api/sample-pools/route.ts
import { NextResponse } from "next/server";

type SamplePool = { address: string; label: string };
const REVALIDATE = 60;

function pickBaseUrl(network: string) {
  const n = network.toLowerCase();
  return n === "devnet"
    ? "https://devnet-dlmm-api.meteora.ag"
    : "https://dlmm-api.meteora.ag";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const network = (searchParams.get("network") || "mainnet").toLowerCase();
  const base = pickBaseUrl(network);

  try {
    const res = await fetch(`${base}/pair/all`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) {
      return NextResponse.json(
        { pools: [] as SamplePool[], reason: `upstream ${res.status}`, network },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const data = (await res.json()) as unknown;
    const pools: SamplePool[] = Array.isArray(data)
      ? data
          .map((it) => {
            if (!it || typeof it !== "object") return null;
            const r = it as Record<string, unknown>;
            const address = typeof r.address === "string" ? r.address : "";
            if (!address) return null;
            const symbol = typeof r.symbol === "string" ? r.symbol : "";
            const label = symbol ? symbol : `${address.slice(0, 4)}…${address.slice(-4)}`;
            return { address, label };
          })
          .filter((x): x is SamplePool => !!x)
          .slice(0, 12)
      : [];

    return NextResponse.json(
      { pools, count: pools.length, network, source: "meteora" },
      { headers: { "Cache-Control": `max-age=0, s-maxage=${REVALIDATE}` } }
    );
  } catch (e) {
    return NextResponse.json(
      { pools: [] as SamplePool[], reason: e instanceof Error ? e.message : "fetch-failed", network },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
