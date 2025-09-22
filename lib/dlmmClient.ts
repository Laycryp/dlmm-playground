export type BinPoint = { price: number; liquidity: number };

export async function fetchSolPriceUSDC(): Promise<number> {
  const res = await fetch('/api/price', { cache: 'no-store' });
  const data = await res.json();
  if (typeof data?.price !== 'number') throw new Error('Price fetch failed');
  return data.price;
}

// نفس الدالة السابقة، بلا تغيير
export async function fetchDemoBins(basePrice?: number): Promise<BinPoint[]> {
  const base = basePrice ?? 100;
  const arr: BinPoint[] = [];
  for (let i = -12; i <= 12; i++) {
    const price = +(base + i * (base * 0.01)).toFixed(4); // ±1% steps
    const liquidity = Math.max(0, 120 - Math.abs(i) * 8);
    arr.push({ price, liquidity });
  }
  return arr;
}

// TODO: replace with real DLMM Devnet fetch by poolAddress
export async function fetchBinsByPoolAddress(poolAddress: string, basePrice?: number) {
  // نفضّل السيرفر؛ وإن فشل نرجع demo محلي
  try {
    const url = `/api/bins?pool=${encodeURIComponent(poolAddress)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data?.bins)) {
      return data.bins as BinPoint[];
    }
  } catch {
    // fallback محلي
    return fetchDemoBins(basePrice);
  }
  return fetchDemoBins(basePrice);
}

