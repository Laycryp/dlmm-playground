import ConnectWallet from "../components/ConnectWallet";
import DlmmView from "../components/DlmmView";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <header className="container pt-10 pb-4">
        <h1 className="h1">DLMM Playground (Devnet)</h1>
        <p className="muted">Connect your Phantom wallet on <b>Devnet</b> to start exploring DLMM.</p>
      </header>

      <section className="container space-y-4">
        <ConnectWallet />
        <DlmmView />
      </section>

      <footer className="container py-10 text-center text-xs muted">
        Built for the Saros DLMM Demo Challenge
      </footer>
    </main>
  );
}
