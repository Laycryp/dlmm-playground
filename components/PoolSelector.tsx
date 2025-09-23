"use client";
import { useEffect, useState } from "react";

type SamplePool = { address: string; label: string };

export default function PoolSelector({
  network,
  onSelect,
}: {
  network: "mainnet" | "devnet";
  onSelect: (address: string) => void;
}) {
  const [value, setValue] = useState("");
  const [samples, setSamples] = useState<SamplePool[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/sample-pools?network=${network}`);
        const json = (await res.json()) as { pools?: SamplePool[] };
        if (!mounted) return;
        setSamples(Array.isArray(json.pools) ? json.pools : []);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Failed to load pools");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [network]);

  function loadPool(addr: string) {
    if (!addr || addr.length < 30) return;
    onSelect(addr.trim());
  }

  return (
    <div className="card p-4 space-y-3">
      <label className="text-sm muted">Enter {network} pool address</label>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-xl border px-3 py-2 text-sm bg-white/5 outline-none"
          placeholder={`Paste a DLMM pool address on ${network}…`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="btn btn-outline" onClick={() => loadPool(value)}>
          Load Pool
        </button>
        <button
          className="btn btn-outline"
          onClick={() => navigator.clipboard?.writeText(value)}
        >
          Copy
        </button>
        <button className="btn btn-primary" onClick={() => setValue("")}>
          Clear
        </button>
      </div>

      <div>
        <div className="text-sm muted mb-1">
          {loading ? "Loading pools…" : `Example Pools (${network})`}
          {err ? <span className="text-red-500 ml-2">[{err}]</span> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {samples.map((p) => (
            <button
              key={p.address}
              className="btn btn-outline"
              onClick={() => loadPool(p.address)}
              title={p.address}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
