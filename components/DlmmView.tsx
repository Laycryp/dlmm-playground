'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import ThemeToggle from '@/components/ThemeToggle';
import ConnectWallet from '@/components/ConnectWallet';
import PoolSelector from '@/components/PoolSelector';
import {
  fetchDemoBins,
  fetchBinsByPoolAddress,
  fetchSolPriceUSDC,
} from '@/lib/dlmmClient';

type BinPoint = { price: number; liquidity: number };

export default function DlmmView() {
  const { connected } = useWallet();

  const [bins, setBins] = useState<BinPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [price, setPrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [poolAddress, setPoolAddress] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const loadPriceAndBins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await fetchSolPriceUSDC();
      setPrice(p);
      const demo = await fetchDemoBins(p);
      setBins(demo);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load price');
      const demo = await fetchDemoBins();
      setBins(demo);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPriceAndBins();
    const id = setInterval(loadPriceAndBins, 30_000);
    return () => clearInterval(id);
  }, [loadPriceAndBins]);

  async function handleLoadPool(addr: string) {
    setPoolAddress(addr);
    setLoading(true);
    try {
      const points = await fetchBinsByPoolAddress(addr, price ?? undefined);
      if (!points || points.length === 0) {
        throw new Error('No bins from upstream, showing demo.');
      }
      setBins(points);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load pool bins');
      // fallback demo
      const demo = await fetchDemoBins(price ?? undefined);
      setBins(demo);
    } finally {
      setLoading(false);
    }
  }

  // بيانات المحور X على هيئة string لتنسيق لطيف
  const chartData = useMemo(
    () => bins.map((b) => ({ ...b, priceLabel: Number(b.price).toFixed(2) })),
    [bins]
  );

  return (
    <section className="w-full space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">DLMM Playground</h1>
        <div className="flex items-center gap-2">
          <ConnectWallet />
          <ThemeToggle />
        </div>
      </header>

      {/* Info cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="text-sm muted mb-1">Network</div>
          <div className="font-semibold">Devnet</div>
        </div>

        <div className="card p-5">
          <div className="text-sm muted mb-1">Wallet</div>
          <div className={`font-semibold ${connected ? 'text-green-500' : 'text-red-500'}`}>
            {connected ? 'Connected' : 'Not connected'}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm muted mb-1">SOL Price (USDC)</div>
              <div className="font-semibold">
                {price ? price.toFixed(4) : loading ? 'Loading…' : '—'}
              </div>
              {lastUpdated && <div className="text-xs muted">Updated: {lastUpdated}</div>}
            </div>
            <button
              className="btn btn-outline"
              onClick={loadPriceAndBins}
              disabled={loading}
              title="Refresh price and bins"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Pool selector */}
      <PoolSelector onSelect={handleLoadPool} />

      {/* Chart */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">
            Liquidity Bins{' '}
            {poolAddress && (
              <span className="text-xs muted">— Pool: {poolAddress.slice(0, 4)}…{poolAddress.slice(-4)}</span>
            )}
          </h2>
          <div className="flex gap-3">
            <input className="border rounded-xl px-3 py-2 text-sm bg-transparent" defaultValue="SOL" />
            <input className="border rounded-xl px-3 py-2 text-sm bg-transparent" defaultValue="USDC" />
          </div>
        </div>

        {error && <div className="text-xs text-red-500 mb-2">Note: {error}</div>}

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 10, right: 10 }}>
              <defs>
                {/* تدرّج أرجواني واضح */}
                <linearGradient id="binGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c084fc" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis dataKey="priceLabel" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v: unknown, name: unknown) => [v as string, name === 'liquidity' ? 'Liquidity' : (name as string)]}
                labelFormatter={(l: unknown) => `Price ≈ ${l}`}
              />
              {/* اجعل اللون صريحًا ولا تعتمد على currentColor */}
              <Bar
                dataKey="liquidity"
                fill="url(#binGradient)"
                stroke="none"
                shapeRendering="crispEdges"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs muted mt-2">
          If upstream (SDK/REST) can’t be reached or the pool is empty, synthetic bins are shown as a fallback.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button className="btn btn-primary" disabled={!connected}>
          Add Liquidity
        </button>
        <button className="btn btn-outline" disabled={!connected}>
          Swap
        </button>
      </div>
    </section>
  );
}
