"use client";

import { useWallet } from "@/app/wallet-context";
import { useBalance } from "@/hooks/use-balance";

function formatXlm(raw: string) {
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return raw;
  return n.toFixed(4).replace(/\.?0+$/, "");
}

export function BalanceCard() {
  const { address } = useWallet();
  const { data, isLoading, isError } = useBalance(address);

  if (!address) return null;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="text-xs uppercase tracking-wider text-subtle">Balance</div>
      <div className="mt-2 font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
        {isLoading ? (
          <span className="inline-block h-7 w-32 animate-pulse rounded bg-elevated sm:h-8 sm:w-40" />
        ) : isError ? (
          <span className="text-base font-normal text-danger">
            Failed to load
          </span>
        ) : (
          <>
            {formatXlm(data ?? "0")}
            <span className="ml-2 text-base font-normal text-muted">XLM</span>
          </>
        )}
      </div>
    </div>
  );
}
