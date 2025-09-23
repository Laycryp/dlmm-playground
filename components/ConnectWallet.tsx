'use client';

import dynamic from 'next/dynamic';

// نستعمل الزر الجاهز من محفظة سولانا
const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

export default function ConnectWallet() {
  return (
    <div className="[&>*]:!h-9 [&>*]:!rounded-xl [&>*]:!text-sm">
      <WalletMultiButton />
    </div>
  );
}
