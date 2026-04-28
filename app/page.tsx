import { WalletButton } from "@/components/wallet-button";
import { Dashboard } from "@/components/dashboard";
import { PoolStats } from "@/components/pool-stats";

export default function Home() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="flex items-center justify-between gap-3 pb-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-subtle">
              Stellar testnet · Soroban vault
            </div>
            <h1 className="mt-1 flex items-center gap-2.5 text-2xl font-semibold tracking-tight sm:text-3xl">
              <span className="h-2 w-2 rounded-full bg-accent" />
              Lending Vault
            </h1>
          </div>
          <WalletButton />
        </header>

        <div className="rounded-lg border border-border bg-surface px-4 py-4 sm:px-6">
          <PoolStats />
        </div>

        <Dashboard />
      </div>
    </main>
  );
}
