// Node runtime + no cache
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function fetchPrice(): Promise<number> {
  // نعيد استخدام /api/price لقراءة السعر الحي (مع fallback)
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/price`, { cache: 'no-store' })
    .catch(() => null);
  if (res && res.ok) {
    const d = await res.json();
    if (typeof d?.price === 'number') return d.price;
  }
  return 100; // fallback
}

// دالة توليد بِنز demo حول سعر معيّن
function buildDemoBins(base: number) {
  const out: Array<{ price: number; liquidity: number }> = [];
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
    // TODO: لاحقًا هنا نستدعي DLMM SDK ب‍ poolAddress لقراءة البِنز الحقيقية.
    const price = await fetchPrice();
    const bins = buildDemoBins(price);
    return new Response(JSON.stringify({ pool, price, bins }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'bins_failed' }), { status: 500 });
  }
}
