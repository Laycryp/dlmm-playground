// app/api/sample-pools/route.ts
import { NextResponse } from "next/server";

type SamplePool = {
  address: string;
  label: string;
};

const REVALIDATE = 60;

// نحاول نقرأ pair/all من meteora devnet ونرجّع مجموعة مسابح مع أسماء مبسّطة
export async function GET(req: Request) {
  const url = "https://devnet-dlmm-api.meteora.ag/pair/all";
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE } });
    if (!res.ok) {
      return NextResponse.json(
        { pools: [] as SamplePool[], reason: `upstream ${res.status}` },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    const data = (await res.json()) as unknown;

    const pools: SamplePool[] = Array.isArray(data)
      ? data
          .map((it) => {
            if (!it || typeof it !== "object") return null;
            const r = it as Record<string, unknown>;
            const address =
              typeof r.address === "string" ? (r.address as string) : "";
            if (!address) return null;

            // لو فيه symbol نعرضه، وإلا نعرض أول/آخر 4 حروف من العنوان
            const symbol =
              typeof r.symbol === "string" ? (r.symbol as string) : "";
            const label = symbol
              ? symbol
              : `${address.slice(0, 4)}…${address.slice(-4)}`;

            return { address, label };
          })
          .filter((x): x is SamplePool => !!x)
          // ناخذ أول 10 فقط
          .slice(0, 10)
      : [];

    return NextResponse.json(
      { pools, count: pools.length, source: "meteora-devnet" },
      {
        headers: {
          "Cache-Control": `max-age=0, s-maxage=${REVALIDATE}`,
        },
      }
    );
  } catch (e) {
    return NextResponse.json(
      {
        pools: [] as SamplePool[],
        reason: e instanceof Error ? e.message : "fetch-failed",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
