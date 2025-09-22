// Force Node runtime (not edge) + disable caching
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function tryFetch(url: string, timeoutMs = 2000) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'accept': 'application/json',
        // بعض المزودين يرفضون بدون UA
        'user-agent': 'dlmm-playground/1.0 (+https://example.local)'
      },
      signal: ac.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

async function jupiterPrice(): Promise<number | null> {
  try {
    const data = await tryFetch('https://price.jup.ag/v6/price?ids=SOL&vsToken=USDC');
    const p = data?.data?.SOL?.price;
    return typeof p === 'number' ? p : null;
  } catch (e) {
    console.error('Jupiter fetch failed:', e);
    return null;
  }
}

async function coingeckoPrice(): Promise<number | null> {
  try {
    // CoinGecko: usd (نحوّل لاحقًا لـ “USDC” بنفس القيمة تقريبا)
    const data = await tryFetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const p = data?.solana?.usd;
    return typeof p === 'number' ? p : null;
  } catch (e) {
    console.error('CoinGecko fetch failed:', e);
    return null;
  }
}

export async function GET() {
  try {
    let price = await jupiterPrice();
    let source = 'jupiter';
    if (price == null) {
      price = await coingeckoPrice();
      source = 'coingecko';
    }
    if (price == null) {
      // آخر حل: رقم افتراضي حتى لا تتعطل الواجهة
      return new Response(JSON.stringify({ price: 100, source: 'fallback' }), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
      });
    }
    return new Response(JSON.stringify({ price, source }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  } catch (e: any) {
    console.error('API /api/price error:', e);
    return new Response(JSON.stringify({ error: e?.message ?? 'fetch_failed' }), { status: 500 });
  }
}
