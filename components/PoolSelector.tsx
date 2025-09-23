"use client";

import { useEffect, useState } from "react";

type SamplePool = { address: string; label: string };

export default function PoolSelector({
  onSelect,
}: {
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
        const res = await fetch("/api/sample-pools");
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
  }, []);

  function loadPool(addr: string) {
    if (!addr || addr.length < 30) return;
    onSelect(addr.trim());
  }

  return (
    <div className="card p-4 space-y-3">
      <label className="text-sm muted">Enter Devnet pool address</label>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-xl border px-3 py-2 text-sm bg-white/5 outline-none"
          placeholder="Paste a DLMM pool address on Devnet…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          className="btn btn-outline"
          onClick={() => loadPool(value)}
          title="Load pool"
        >
          Load Pool
        </button>
        <button
          className="btn btn-outline"
          onClick={() => {
            if (!navigator.clipboard) return;
            navigator.clipboard.writeText(value);
          }}
        >
          Copy
        </button>
        <button className="btn btn-primary" onClick={() => setValue("")}>
          Clear
        </button>
      </div>

      {/* Pools discovered from meteora devnet */}
      <div>
        <div className="text-sm muted mb-1">
          {loading ? "Loading sample Devnet pools…" : "Example Pools (Devnet)"}
          {err ? <span className="text-red-500 ml-2">[{err}]</span> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {samples.length === 0 && !loading ? (
            <>
              <button
                className="btn btn-outline"
                onClick={() =>
                  loadPool("35pqwzfx5qbifizJhe9VjuMJMV3Ut8bVHyn4nZvmC25R")
                }
              >
                Example Pool A (Devnet)
              </button>
              <button
                className="btn btn-outline"
                onClick={() =>
                  loadPool("9hqRpenQ9VGGaMY7YDEUx9QU2uaoj67jxQgf8HPXGxqU")
                }
              >
                Example Pool B (Devnet)
              </button>
            </>
          ) : (
            samples.map((p) => (
              <button
                key={p.address}
                className="btn btn-outline"
                onClick={() => loadPool(p.address)}
                title={p.address}
              >
                {p.label}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
