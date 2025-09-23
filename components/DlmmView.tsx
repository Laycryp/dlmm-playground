"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { fetchDemoBins } from "../lib/dlmmClient";
import PoolSelector from "./PoolSelector";

type BinPoint = { price: number; liquidity: number };

export default function DlmmView() {
  const { connected } = useWallet();

  const [network, setNetwork] = useState<"mainnet" | "devnet">("mainnet");
  const [bins, setBins] = useState<BinPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [price, setPrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [poolAddress, setPoolAddress] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // جلب السعر (ببساطة من CoinGecko عبر /api/price إن كان عندك؛ أو تجاهل السعر)
  const loadPrice = useCallback(async () => {
    try {
      const res = await fetch(`/api/price?network=${network}`);
      if (!res.ok) throw new Error(`price ${res.status}`);
      const json = (await res.json()) as { price?: number };
      if (typeof json.price === "number") setPrice(json.price);
    } catch {
      setPrice(null);
    }
  }, [network]);

  // جلب bins للمسبح
  const loadBins = useCallback(
    async (addr?: string) => {
      const pool = (addr ?? poolAddress).trim();
      if (!pool) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/bins?pool=${encodeURIComponent(pool)}&network=${network}`
        );
        const json = await res.json();
        const points = Array.isArray(json.bins) ? (json.bins as BinPoint[]) : [];
        setBins(points);
        setLastUpdated(new Date().toLocaleTimeString());
        if (!res.ok) setError(json?.reason ?? "failed to load bins");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load bins");
        const demo = await fetchDemoBins();
        setBins(demo);
      } finally {
        setLoading(false);
      }
    },
    [network, poolAddress]
  );

  // initial
  useEffect(() => {
    loadPrice();
  }, [loadPrice]);

  function handleSelectPool(addr: string) {
    setPoolAddress(addr);
    loadBins(addr);
  }

  const PrettyTooltip = useMemo(
    () =>
      function PrettyTooltipFn({
        active,
        payload,
        label,
      }: {
        active?: boolean;
        payload?: Array<{ value: number; name: string }>;
        label?: number | string;
      }) {
        if (!active || !payload || payload.length === 0) return null;
        const item = payload[0];
        return (
          <div className="rounded-xl bg-black/70 px-3 py-2 text-xs text-white">
            <div>Price: {label}</div>
            <div>Liquidity: {item.value}</div>
          </div>
        );
      },
    []
  );

  return (
    <section className="w-full space-y-4">
      {/* Header controls */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="text-sm muted mb-1">Network</div>
          <select
            className="rounded-xl border px-3 py-2 text-sm bg-white/5 outline-none"
            value={network}
            onChange={(e) => setNetwork(e.target.value as "mainnet" | "devnet")}
          >
            <option value="mainnet">Mainnet</option>
            <option value="devnet">Devnet</option>
          </select>
        </div>

        <div className="card p-5">
          <div className="text-sm muted mb-1">Wallet</div>
          <div className={`font-semibold ${connected ? "text-green-500" : "text-red-500"}`}>
            {connected ? "Connected" : "Not connected"}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm muted mb-1">SOL Price (USDC)</div>
              <div className="font-semibold">{price ? price.toFixed(4) : "—"}</div>
              {lastUpdated && <div className="text-xs muted">Updated: {lastUpdated}</div>}
            </div>
            <button className="btn btn-outline" onClick={() => loadPrice()} disabled={loading}>
              {loading ? "…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* Pool selector */}
      <PoolSelector network={network} onSelect={handleSelectPool} />

      {/* Chart */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">
            Liquidity Bins{" "}
            {poolAddress ? (
              <span className="text-xs muted">— Pool: {poolAddress.slice(0, 4)}…{poolAddress.slice(-4)}</span>
            ) : null}
          </h2>
          <div className="flex gap-3">
            <input className="border rounded-xl px-3 py-2 text-sm" readOnly value="SOL" />
            <input className="border rounded-xl px-3 py-2 text-sm" readOnly value="USDC" />
          </div>
        </div>

        {error && <div className="text-xs text-red-500 mb-2">Error: {error}</div>}

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bins} margin={{ left: 10, right: 10 }}>
              <XAxis dataKey="price" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip content={<PrettyTooltip />} />
              <Bar dataKey="liquidity" />
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
