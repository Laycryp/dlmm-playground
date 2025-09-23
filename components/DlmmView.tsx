'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

import ThemeToggle from './ThemeToggle';
import ConnectWallet from './ConnectWallet';
import PoolSelector from './PoolSelector';
import {
  fetchDemoBins,
  fetchSolPriceUSDC,
  fetchBinsByPoolAddress,
  type BinPoint,
} from '../lib/dlmmClient';

export default function DlmmView() {
  const { connected } = useWallet();

  const [bins, setBins] = useState<BinPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [price, setPrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [poolAddress, setPoolAddress] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<string>('');

  /** اختر الشبكة المعروضة في البطاقة */
  const NETWORK: 'devnet' | 'mainnet' = 'devnet';

  const loadPriceAndBins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sol = await fetchSolPriceUSDC();
      setPrice(sol);
      const demo = await fetchDemoBins(sol);
      setBins(demo);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load price');
      const demo = await fetchDemoBins();
      setBins(demo);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => { if (mounted) await loadPriceAndBins(); })();
    const id = setInterval(loadPriceAndBins, 30_000);
    return () => { mounted = false; clearInterval(id); };
  }, [loadPriceAndBins]);

  async function handleLoadPool(addr: string) {
    setPoolAddress(addr);
    setLoading(true);
    try {
      const points = await fetchBinsByPoolAddress(addr, price ?? undefined);
      setBins(points);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pool bins');
      const demo = await fetchDemoBins(price ?? undefined);
      setBins(demo);
    } finally {
      setLoading(false);
    }
  }

  const handleSelectPool = (addr: string) => {
    void handleLoadPool(addr);
  };

  // ---- Tooltip: نوع بسيط مخصّص بدل TooltipProps لتفادي أخطاء TS ----
  type SimpleTooltipPayloadItem = { value?: number | string };
  type SimpleTooltipProps = {
    active?: boolean;
    label?: number | string;
    payload?: SimpleTooltipPayloadItem[];
  };

  function PrettyTooltip({ active, label, payload }: SimpleTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;
    const v = payload[0]?.value;
    return (
      <div className="rounded-md bg-slate-900/90 px-3 py-2 text-xs text-white shadow dark:bg-slate-900/90">
        <div>Price ≈ {label}</div>
        <div>Liquidity: {v}</div>
      </div>
    );
  }
  // -------------------------------------------------------------------

  const headerRight = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <ConnectWallet />
      </div>
    ),
    []
  );

  return (
    <section className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="h1">DLMM Playground</h1>
        {headerRight}
      </div>

      {/* Info cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="text-sm muted mb-1">Network</div>
          <div className="font-semibold capitalize">{NETWORK}</div>
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
      <PoolSelector network={NETWORK} onSelect={handleSelectPool} />

      {/* Chart */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">
            Liquidity Bins{' '}
            {poolAddress && (
              <span className="text-xs muted">— Pool: {poolAddress.slice(0,4)}…{poolAddress.slice(-4)}</span>
            )}
          </h2>
          <div className="flex gap-3">
            <input className="border rounded-xl px-3 py-2 text-sm bg-transparent" defaultValue="SOL" />
            <input className="border rounded-xl px-3 py-2 text-sm bg-transparent" defaultValue="USDC" />
          </div>
        </div>

        {error && <div className="text-xs text-red-500 mb-2">Error: {error}</div>}

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bins} margin={{ left: 10, right: 10 }}>
              <defs>
                <linearGradient id="binGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c084fc" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis dataKey="price" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip content={<PrettyTooltip />} />
              <Bar dataKey="liquidity" fill="url(#binGradient)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs muted mt-2">
          If upstream (SDK/REST) can’t be reached or the pool is empty, synthetic bins are shown as a fallback.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button className="btn btn-primary" disabled={!connected}>Add Liquidity</button>
        <button className="btn btn-outline" disabled={!connected}>Swap</button>
      </div>
    </section>
  );
}
