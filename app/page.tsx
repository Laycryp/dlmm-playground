// app/page.tsx
import DlmmView from '../components/DlmmView';
import ThemeToggle from '../components/ThemeToggle';
import ConnectWallet from '../components/ConnectWallet';

export default function Page() {
  return (
    <main className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
      {/* Header bar — العنوان مع أزرار الثيم وربط المحفظة */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="h1">DLMM Playground</h1>
          <p className="muted text-sm">
            Connect your Phantom wallet, see SOL/USDC price, and explore liquidity bins with a clean UI.
          </p>
        </div>

        {/* الأزرار اللي اختفت */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ConnectWallet />
        </div>
      </div>

      {/* باقي الصفحة */}
      <DlmmView />
    </main>
  );
}
