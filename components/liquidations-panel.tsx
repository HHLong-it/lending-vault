"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/app/wallet-context";
import { useLiquidatablePositions } from "@/hooks/use-pool";
import { useLiquidate } from "@/hooks/use-vault-actions";
import { toError, UserRejectedError } from "@/lib/errors";

function fmtXlm(stroops: bigint): string {
  return (Number(stroops) / 1e7).toFixed(4).replace(/\.?0+$/, "");
}

function shorten(addr: string) {
  if (!addr) return "";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function LiquidationsPanel() {
  const { address } = useWallet();
  const { data, isLoading } = useLiquidatablePositions();

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="text-xs uppercase tracking-wider text-subtle">
          Liquidations
        </div>
        <div className="mt-3 h-16 animate-pulse rounded bg-elevated" />
      </div>
    );
  }

  const positions = data ?? [];

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-subtle">
          Liquidations
        </div>
        <span className="text-[10px] uppercase tracking-wider text-subtle">
          {positions.length === 0
            ? "Nothing open"
            : `${positions.length} past-deadline`}
        </span>
      </div>

      {positions.length === 0 ? (
        <p className="mt-3 text-xs text-muted">
          No past-deadline loans right now. When a borrower misses their
          deadline, anyone can settle the debt and take the collateral.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {positions.map((p) => (
            <Row key={p.borrower} pos={p} canAct={!!address} self={p.borrower === address} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  pos,
  canAct,
  self,
}: {
  pos: ReturnType<typeof useLiquidatablePositions>["data"] extends
    | (infer T)[]
    | undefined
    ? T
    : never;
  canAct: boolean;
  self: boolean;
}) {
  const { address } = useWallet();
  const qc = useQueryClient();
  const liquidate = useLiquidate(address);
  const err = liquidate.error ? toError(liquidate.error) : null;

  async function onClick() {
    try {
      await liquidate.mutateAsync(pos.borrower);
      qc.invalidateQueries({ queryKey: ["liquidatable"] });
      qc.invalidateQueries({ queryKey: ["loan"] });
      qc.invalidateQueries({ queryKey: ["pool-state"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["balance"] });
    } catch {
      // surfaced below
    }
  }

  return (
    <li className="rounded-md border border-border bg-bg/40 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-mono text-xs">
          {shorten(pos.borrower)}
          {self && (
            <span className="ml-2 rounded bg-warn/20 px-1 py-0.5 text-[10px] uppercase tracking-wider text-warn">
              You
            </span>
          )}
        </div>
        <div className="font-mono text-[11px] text-subtle">
          debt {fmtXlm(pos.debt)} · collateral {fmtXlm(pos.loan.collateral)}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-muted">
          Profit:{" "}
          <span className="font-mono font-semibold text-accent">
            {fmtXlm(pos.profit)} XLM
          </span>
        </span>
        <button
          type="button"
          onClick={onClick}
          disabled={!canAct || self || liquidate.isPending}
          title={
            self
              ? "You can't liquidate your own loan"
              : !canAct
                ? "Connect a wallet to liquidate"
                : undefined
          }
          className="rounded-md border border-warn/40 bg-warn/15 px-3 py-1.5 text-xs font-medium text-warn transition-colors hover:bg-warn/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {liquidate.isPending ? "Liquidating…" : "Liquidate"}
        </button>
      </div>
      {err && (
        <div className="mt-2 text-[11px] text-danger">
          {err instanceof UserRejectedError
            ? "You rejected the request in your wallet."
            : `Failed: ${err.message}`}
        </div>
      )}
    </li>
  );
}
