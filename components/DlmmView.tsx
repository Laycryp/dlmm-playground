'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
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
    <section className="w-full space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="text-sm muted mb-1">Network</div>
          <div className="font-semibold">Devnet</div>
        </div>

        <div className="card p-5">
          <div className="text-sm muted mb-1">Wallet</div>
          <div className={`font-semibold ${connected ? 'text-green-600' : 'text-red-600'}`}>
            {connected ? 'Connected' : 'Not connected'}
          </div>
        </div>

        <div className="card p-5">
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
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      <PoolSelector onSelect={handleLoadPool} />

      <div className="card p-6">
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
            <input className="border rounded-xl px-3 py-2 text-sm" defaultValue="SOL" />
            <input className="border rounded-xl px-3 py-2 text-sm" defaultValue="USDC" />
          </div>
        </div>

        {error && <div className="text-xs text-red-600 mb-2">Error: {error}</div>}

        {/* Fixed-size chart to guarantee visibility on SSR */}
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <BarChart
              width={720}
              height={260}
              data={bins}
              margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
            >
              <XAxis
                dataKey="price"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => v.toFixed(2)}
              />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 'auto']} />
              <Tooltip
                formatter={(value: number | string, name: string) => [
                  typeof value === 'number' ? value.toLocaleString() : value,
                  name === 'liquidity' ? 'Liquidity' : name,
                ]}
                labelFormatter={(label: number | string) =>
                  `Price ≈ ${typeof label === 'number' ? label.toFixed(4) : label}`
                }
              />
              <Bar dataKey="liquidity" fill="#7c3aed" isAnimationActive={false} />
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
