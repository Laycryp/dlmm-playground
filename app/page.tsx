// app/page.tsx
import DlmmView from "../components/DlmmView"; // ← مسار نسبي بدل "@/components/…"

export default function Page() {
  return (
    <main className="container py-6 space-y-4">
      <header className="mb-2">
        <h1 className="h1">DLMM Playground</h1>
        <p className="muted">
          Connect your Phantom wallet, see SOL/USDC price, and explore liquidity bins with a clean UI.
        </p>
      </header>

      <DlmmView />
    </main>
  );
}
