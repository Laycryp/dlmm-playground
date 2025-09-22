export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getErrMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

type BinPoint = { price: number; liquidity: number };

async function fetchPrice(origin: string): Promise<number> {
  try {
    const res = await fetch(`${origin}/api/price`, { cache: 'no-store' });
    if (res.ok) {
      const d = (await res.json()) as { price?: number };
      if (typeof d?.price === 'number') return d.price;
    }
  } catch {
    // ignore and fallback
  }
  return 100; // fallback
}

function buildDemoBins(base: number): BinPoint[] {
  const out: BinPoint[] = [];
  for (let i = -12; i <= 12; i++) {
    const price = +(base + i * (base * 0.01)).toFixed(4); // ±1%
    const liquidity = Math.max(0, 120 - Math.abs(i) * 8);
    out.push({ price, liquidity });
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const pool = url.searchParams.get('pool') || '';
    const origin = url.origin; // يستخدم دومين الطلب نفسه
    // TODO: استبدل لاحقًا بمناداة DLMM SDK باستخدام pool لقراءة bins حقيقية
    const price = await fetchPrice(origin);
    const bins = buildDemoBins(price);
    return new Response(JSON.stringify({ pool, price, bins }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ error: getErrMsg(e) }), { status: 500 });
  }
}
