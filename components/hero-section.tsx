export function HeroSection() {
  return (
    <section className="mt-6">
      <p className="text-base leading-relaxed text-muted sm:text-lg">
        An over-collateralized lending pool on Stellar Testnet.{" "}
        <span className="text-fg">Lend XLM for yield, or borrow against</span>{" "}
        110% collateral with a fixed deadline. Late loans get liquidated by
        anyone willing to settle the debt.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <Step n={1} label="Lend" desc="Deposit XLM, mint LP shares" />
        <Step n={2} label="Borrow" desc="Post 110% collateral, draw XLM" />
        <Step n={3} label="Repay or get liquidated" desc="5% APR, hard deadline" />
      </div>
    </section>
  );
}

function Step({ n, label, desc }: { n: number; label: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent font-mono text-xs text-accent">
        {n}
      </span>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-subtle">{desc}</div>
      </div>
    </div>
  );
}
