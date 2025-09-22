'use client';

import { useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

export default function ConnectWallet() {
  const { connected, publicKey, connecting, disconnecting, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const shortPk = useMemo(() => {
    const s = publicKey?.toBase58();
    return s ? `${s.slice(0, 4)}…${s.slice(-4)}` : '';
  }, [publicKey]);

  // حالة متصل
  if (connected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-300/40 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-fuchsia-400 to-purple-600 shadow-sm" />
          <div className="leading-tight">
            <div className="text-xs muted">Connected</div>
            <div className="font-medium">{shortPk}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* رابط نصّي لتبديل المحفظة */}
          <button
            className="text-sm font-medium text-fuchsia-400 hover:text-fuchsia-300 underline decoration-dotted underline-offset-4"
            onClick={() => setVisible(true)}
            title="Change wallet"
          >
            Change
          </button>
          {/* رابط نصّي لفصل المحفظة */}
          <button
            className="text-sm font-medium text-rose-400 hover:text-rose-300 underline decoration-dotted underline-offset-4"
            onClick={() => void disconnect()}
            disabled={disconnecting}
            title="Disconnect wallet"
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      </div>
    );
  }

  // حالة غير متصل — "Connect Wallet" كنص واضح قابل للنقر
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-300/40 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/60 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-violet-400 to-indigo-600 shadow-sm" />
        <div className="leading-tight">
          <div className="text-xs muted">Wallet</div>
          <div className="font-medium">Phantom</div>
        </div>
      </div>

      {/* النصّ القابل للنقر */}
      <button
        className="text-base font-semibold text-fuchsia-400 hover:text-fuchsia-300 underline decoration-2 underline-offset-4"
        onClick={() => setVisible(true)}
        disabled={connecting}
        title="Connect a Solana wallet"
        aria-label="Connect Wallet"
      >
        Connect Wallet
      </button>
    </div>
  );
}
