'use client';

import { useCallback, useMemo, useState } from 'react';

type Props = {
  onSelect: (address: string) => Promise<void> | void;
};

type Preset = { label: string; address: string };

// ضع عناوين DLMM Devnet الحقيقية عندما تتوفر
const PRESETS: Preset[] = [
  { label: 'Example Pool A (Devnet)', address: '11111111111111111111111111111111' },
  { label: 'Example Pool B (Devnet)', address: '22222222222222222222222222222222' },
  { label: 'Example Pool C (Devnet)', address: '33333333333333333333333333333333' },
];

function looksLikeBase58Address(s: string) {
  const base58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return s.length >= 30 && s.length <= 50 && base58.test(s);
}

export default function PoolSelector({ onSelect }: Props) {
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = useMemo(() => looksLikeBase58Address(address.trim()), [address]);

  const load = useCallback(async () => {
    if (!address.trim()) return;
    setBusy(true);
    try {
      await onSelect(address.trim());
    } finally {
      setBusy(false);
    }
  }, [address, onSelect]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address.trim());
    } catch {}
  }, [address]);

  return (
    <div className="card glass p-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm muted">Enter Devnet pool address</label>
        <p className="text-xs muted">
          This field expects a <b>DLMM Pool address</b> (not a wallet address). If an invalid pool is used, demo bins will be shown.
        </p>

        <div className="flex gap-2">
          <input
            className={`border rounded-xl px-3 py-2 text-sm w-full bg-transparent ${
              address && !valid ? 'ring-1 ring-red-400 border-red-400' : ''
            }`}
            placeholder="Paste a DLMM pool address on Devnet…"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <button
            onClick={load}
            disabled={!valid || busy}
            className="btn btn-outline"
            title={valid ? 'Load Pool' : 'Enter a valid base58 pool address'}
          >
            {busy ? 'Loading…' : 'Load Pool'}
          </button>
          <button onClick={copy} className="btn btn-outline" disabled={!address}>
            Copy
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-1">
          {PRESETS.map((p) => (
            <button
              key={p.address + p.label}
              className="btn btn-outline text-xs"
              onClick={() => setAddress(p.address)}
              title={p.address}
            >
              {p.label}
            </button>
          ))}
          <button className="btn text-xs btn-primary" onClick={() => setAddress('')}>
            Clear
          </button>
        </div>

        {!valid && address ? (
          <div className="text-xs text-red-400">
            Address doesn&apos;t look like a valid base58 <b>pool</b> pubkey.
          </div>
        ) : null}
      </div>
    </div>
  );
}
