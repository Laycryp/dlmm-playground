'use client';

import { useCallback, useMemo, useState } from 'react';

type Props = {
  onSelect: (address: string) => Promise<void> | void;
};

type Preset = { label: string; address: string };

// ملاحظات: ضع عناوين Devnet الحقيقية هنا لاحقًا
const PRESETS: Preset[] = [
  { label: 'Example Pool A (Devnet)', address: '11111111111111111111111111111111' },
  { label: 'Example Pool B (Devnet)', address: '22222222222222222222222222222222' },
  { label: 'Example Pool C (Devnet)', address: '33333333333333333333333333333333' },
];

// تحقق بسيط لعنوان base58 بطول منطقي (ليس مثالي لكنه مفيد للـ UI)
function looksLikeBase58Address(s: string) {
  const base58 = /^[1-9A-HJ-NP-Za-km-z]+$/; // بدون 0 O I l
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
      <div className="flex flex-col gap-3">
        <label className="text-sm muted">Enter Devnet pool address</label>

        <div className="flex gap-2">
          <input
            className={`input border rounded-xl px-3 py-2 text-sm w-full bg-transparent ${
              address && !valid ? 'ring-1 ring-red-400 border-red-400' : ''
            }`}
            placeholder="Enter Devnet pool address…"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <button
            onClick={load}
            disabled={!valid || busy}
            className="btn btn-outline"
            title={valid ? 'Load Pool' : 'Enter a valid base58 address'}
          >
            {busy ? 'Loading…' : 'Load Pool'}
          </button>
          <button onClick={copy} className="btn btn-outline" disabled={!address}>
            Copy
          </button>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap gap-2">
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
          <div className="text-xs text-red-400">Address doesn&apos;t look like a valid base58 pubkey.</div>
        ) : null}
      </div>
    </div>
  );
}
