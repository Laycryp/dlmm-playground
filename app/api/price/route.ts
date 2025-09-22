// Force Node runtime (not edge) + disable caching
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getErrMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function tryFetch(url: string, timeoutMs = 2000): Promise<unknown> {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'user-agent': 'dlmm-playground/1.0 (+https://example.local)',
      },
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

async function jupiterPrice(): Promise<number | null> {
  try {
    const data = (await tryFetch(
      'https://price.jup.ag/v6/price?ids=SOL&vsToken=USDC'
    )) as { data?: { SOL?: { price?: number } } };
    const p = data?.data?.SOL?.price;
    return typeof p === 'number' ? p : null;
  } catch (e: unknown) {
    console.error('Jupiter fetch failed:', getErrMsg(e));
    return null;
  }
}

async function coingeckoPrice(): Promise<number | null> {
  try {
    const data = (await tryFetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
    )) as { solana?: { usd?: number } };
    const p = data?.solana?.usd;
    return typeof p === 'number' ? p : null;
  } catch (e: unknown) {
    console.error('CoinGecko fetch failed:', getErrMsg(e));
    return null;
  }
}

export async function GET() {
  try {
    let price = await jupiterPrice();
    let source = 'jupiter' as 'jupiter' | 'coingecko' | 'fallback';
    if (price == null) {
      price = await coingeckoPrice();
      source = 'coingecko';
    }
    if (price == null) {
      return new Response(JSON.stringify({ price: 100, source: 'fallback' }), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    return new Response(JSON.stringify({ price, source }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch (e: unknown) {
    console.error('API /api/price error:', getErrMsg(e));
    return new Response(JSON.stringify({ error: getErrMsg(e) }), { status: 500 });
  }
}
