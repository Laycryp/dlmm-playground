'use client';
import { useState } from 'react';

export default function PoolSelector({ onSelect }: { onSelect: (addr: string) => void }) {
  const [addr, setAddr] = useState<string>("");

  return (
    <div className="flex flex-col sm:flex-row gap-2">
  <input
    className="border rounded-xl px-3 py-2 text-sm w-full"
    placeholder="Enter Devnet pool address (PublicKey)"
    value={addr}
    onChange={(e) => setAddr(e.target.value.trim())}
  />
  <button className="btn btn-outline" onClick={() => addr && onSelect(addr)}>Load Pool</button>
  <button
    className="btn btn-outline"
    onClick={() => addr && navigator.clipboard.writeText(addr)}
    disabled={!addr}
  >
    Copy
  </button>
</div>
  );
}
