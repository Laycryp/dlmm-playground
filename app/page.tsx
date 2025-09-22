import DlmmView from "../components/DlmmView"; // ← مسار نسبي بدل "@/..."

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="hero mb-6">
        <div className="container py-8">
          <h1 className="h1 bg-gradient-to-r from-purple-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
            DLMM Playground (Devnet)
          </h1>
          <p className="muted mt-2">
            Connect your Phantom wallet, see SOL/USDC price, and explore liquidity bins with a clean UI.
          </p>
        </div>
      </section>

      {/* Main app */}
      <div className="container">
        <DlmmView />
      </div>
    </>
  );
}
