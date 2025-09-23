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
  TooltipProps,
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

  /** ثابت بسيط للشبكة التي نعرضها */
  const NETWORK: 'devnet' | 'mainnet' = 'devnet';

  // تحميل السعر + داتا الديمو
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
      const message = e instanceof Error ? e.message : 'Failed to load price';
      setError(message);
      const demo = await fetchDemoBins();
      setBins(demo);
    } finally {
      setLoading(false);
    }
  }, []);

  // التحميل الأول + تحديث كل 30 ثانية
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (mounted) await loadPriceAndBins();
    })();
    const id = setInterval(loadPriceAndBins, 30_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [loadPriceAndBins]);

  // جلب bins لعنوان pool
  async function handleLoadPool(addr: string) {
    setPoolAddress(addr);
    setLoading(true);
    try {
      const points = await fetchBinsByPoolAddress(addr, price ?? undefined);
      setBins(points);
      setError(null);
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : 'Failed to load pool bins';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  // مُغلِّف غير async ليتوافق مع onSelect: (address) => void
  const handleSelectPool = (addr: string) => {
    void handleLoadPool(addr);
  };

  // ----- Tooltip typing fix -----
  type LocalTooltipProps = TooltipProps<number, string> & {
    label?: number | string;
  };

  function PrettyTooltip({ active, label, payload }: LocalTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;
    const first = payload[0];
    return (
      <div className="rounded-md bg-slate-900/90 px-3 py-2 text-xs text-white shadow">
        <div>Price ≈ {label}</div>
        <div>Liquidity: {first.value}</div>
      </div>
    );
  }
  // --------------------------------

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
    <section className="w-full space-y-4">
      {/* العنوان + أزرار الثيم والمحفظة */}
      <div className="flex items-center justify-between">
        <h1 className="h1">DLMM Playground</h1>
        {headerRight}
      </div>

      {/* بطاقات المعلومات */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="text-sm muted mb-1">Network</div>
          <div className="font-semibold capitalize">{NETWORK}</div>
        </div>

        <div className="card p-5">
          <div className="text-sm muted mb-1">Wallet</div>
          <div
            className={`font-semibold ${
              connected ? 'text-green-500' : 'text-red-500'
            }`}
          >
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
              {lastUpdated && (
                <div className="text-xs muted">Updated: {lastUpdated}</div>
              )}
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

      {/* محدد الـ Pool — نمرّر الشبكة المطلوبة */}
      <PoolSelector network={NETWORK} onSelect={handleSelectPool} />

      {/* الرسم البياني */}
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
            <input
              className="border rounded-xl px-3 py-2 text-sm bg-transparent"
              defaultValue="SOL"
              aria-label="Token A"
            />
            <input
              className="border rounded-xl px-3 py-2 text-sm bg-transparent"
              defaultValue="USDC"
              aria-label="Token B"
            />
          </div>
        </div>

        {error && <div className="text-xs text-red-500 mb-2">Error: {error}</div>}

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bins} margin={{ left: 10, right: 10 }}>
              <XAxis dataKey="price" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip content={<PrettyTooltip />} />
              {/* أعمدة بنفسجية */}
              <Bar dataKey="liquidity" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs muted mt-2">
          If the upstream DLMM endpoint can’t be reached or the pool is empty,
          synthetic bins are shown as a fallback.
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
