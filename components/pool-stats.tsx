"use client";

import { usePoolState } from "@/hooks/use-pool";

const VAULT_ID = process.env.NEXT_PUBLIC_MAIN_CONTRACT_ID;

function fmtXlm(stroops?: bigint): string {
  if (stroops === undefined) return "—";
  return (Number(stroops) / 1e7).toFixed(2);
}

export function PoolStats() {
  const { data, isLoading } = usePoolState();

  return (
    <section className="mt-6">
      <div className="text-xs uppercase tracking-wider text-subtle">Pool</div>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="TVL" value={`${fmtXlm(data?.totalXlm)} XLM`} loading={isLoading} />
        <Stat
          label="Borrowed"
          value={`${fmtXlm(data?.borrowedXlm)} XLM`}
          loading={isLoading}
        />
        <Stat
          label="Available"
          value={`${fmtXlm(data?.availableXlm)} XLM`}
          loading={isLoading}
          highlight
        />
        <Stat
          label="Utilization"
          value={data ? `${(data.utilizationBps / 100).toFixed(1)}%` : "—"}
          loading={isLoading}
        />
        <Stat
          label="Vault"
          value={
            VAULT_ID ? `${VAULT_ID.slice(0, 4)}...${VAULT_ID.slice(-4)}` : "—"
          }
          href={
            VAULT_ID
              ? `https://stellar.expert/explorer/testnet/contract/${VAULT_ID}`
              : undefined
          }
          loading={false}
          mono
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  loading,
  href,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  loading: boolean;
  href?: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  const inner = (
    <div
      className={`rounded-md border p-3 transition-colors ${
        highlight ? "border-accent/40 bg-accent/10" : "border-border bg-surface"
      }`}
    >
      <div
        className={`text-[10px] uppercase tracking-wider ${
          highlight ? "text-accent" : "text-subtle"
        }`}
      >
        {label}
      </div>
      <div
        className={`mt-1 font-mono font-semibold ${
          mono ? "text-sm" : "text-base sm:text-lg"
        }`}
      >
        {loading ? (
          <span className="inline-block h-5 w-12 animate-pulse rounded bg-elevated" />
        ) : (
          value
        )}
      </div>
    </div>
  );
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="block rounded-md transition-colors hover:[&>div]:border-accent"
      >
        {inner}
      </a>
    );
  }
  return inner;
}
