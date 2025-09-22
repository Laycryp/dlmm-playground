'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  fetchDemoBins,
  fetchSolPriceUSDC,
  fetchBinsByPoolAddress,
  BinPoint,
} from '../lib/dlmmClient';
import PoolSelector from './PoolSelector';

function getErrMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function PrettyTooltip({ active, label, payload }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value as number;
  return (
    <div className="rounded-xl bg-slate-900/90 text-white p-2 text-xs shadow-lg border border-slate-700">
      <div>Price ≈ <b>{typeof label === 'number' ? label.toFixed(4) : label}</b></div>
      <div>Liquidity: <b>{typeof v === 'number' ? v.toLocaleString() : v}</b></div>
    </div>
  );
}

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
      const sol = await fetchSolPriceUSDC();
      setPrice(sol);
      const demo = await fetchDemoBins(sol);
      setBins(demo);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e: unknown) {
      setError(getErrMsg(e) ?? 'Failed to load price');
      const demo = await fetchDemoBins();
      setBins(demo);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (mounted) await loadPriceAndBins();
    })();
    const id = setInterval(loadPriceAndBins, 30000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [loadPriceAndBins]);

  async function handleLoadPool(addr: string) {
    setPoolAddress(addr);
    setLoading(true);
    try {
      const points = await fetchBinsByPoolAddress(addr, price ?? undefined);
      setBins(points);
      setError(null);
    } catch (e: unknown) {
      setError(getErrMsg(e) ?? 'Failed to load pool bins');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="w-full space-y-6">
      {/* status cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card glass p-5">
          <div className="text-sm muted mb-1">Network</div>
          <div className="font-semibold">Devnet</div>
        </div>

        <div className="card glass p-5">
          <div className="text-sm muted mb-1">Wallet</div>
          <div className={`font-semibold ${connected ? 'text-emerald-500' : 'text-red-400'}`}>
            {connected ? 'Connected' : 'Not connected'}
          </div>
        </div>

        <div className="card glass p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm muted mb-1">SOL Price (USDC)</div>
              <div className="font-semibold">
                {price ? price.toFixed(4) : loading ? 'Loading...' : '—'}
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

      {/* chart card */}
      <div className="card glass p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">
            Liquidity Bins{' '}
            {poolAddress ? (
              <span className="text-xs muted">
                — Pool: {poolAddress.slice(0, 4)}…{poolAddress.slice(-4)}
              </span>
            ) : null}
          </h2>
          <div className="flex gap-3">
            <input className="border rounded-xl px-3 py-2 text-sm bg-transparent" defaultValue="SOL" />
            <input className="border rounded-xl px-3 py-2 text-sm bg-transparent" defaultValue="USDC" />
          </div>
        </div>

        {error && <div className="text-xs text-red-500 mb-2">Error: {error}</div>}

        {/* Fixed-size chart to guarantee visibility on SSR */}
        <div className="overflow-x-auto">
          <div className="min-w-[780px]">
            <BarChart
              width={780}
              height={280}
              data={bins}
              margin={{ left: 8, right: 8, top: 4, bottom: 8 }}
              barSize={18}
            >
              <defs>
                <linearGradient id="binFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a78bfa" />
                  <stop offset="100%" stopColor="#7c3aed" />
                </linearGradient>
              </defs>

              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-slate-300 dark:stroke-slate-700" />
              <XAxis
                dataKey="price"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => v.toFixed(2)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                domain={[0, 'auto']}
              />
              <Tooltip content={<PrettyTooltip />} />
              <Bar
                dataKey="liquidity"
                fill="url(#binFill)"
                radius={[8, 8, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </div>
        </div>

        <p className="text-xs muted mt-2">
          Currently using a stub for bins. Next, we’ll replace it with real DLMM bins fetched from
          the Devnet pool.
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
