'use client';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';

function WalletBadge() {
  const { connected, publicKey } = useWallet();
  if (!connected) {
    return <span className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-700">Not connected</span>;
  }
  const short = publicKey?.toBase58().slice(0, 4) + "..." + publicKey?.toBase58().slice(-4);
  return <span className="text-xs px-2 py-1 rounded-lg bg-green-100 text-green-700">{short}</span>;
}

export default function ConnectWallet() {
  return (
    <div className="card p-5 w-full">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm muted">Wallet</div>
          <div className="font-semibold flex items-center gap-2">
            Phantom <WalletBadge />
          </div>
        </div>
        <WalletMultiButton />
      </div>
    </div>
  );
}
