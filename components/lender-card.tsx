"use client";

import { useState, type FormEvent } from "react";
import { useWallet } from "@/app/wallet-context";
import { useLpBalance, usePoolState } from "@/hooks/use-pool";
import { useDeposit, useWithdraw } from "@/hooks/use-vault-actions";
import {
  toError,
  UserRejectedError,
  InsufficientBalanceError,
} from "@/lib/errors";

const inputCls =
  "w-full rounded-md border border-border bg-bg px-3 py-2 text-sm placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

function fmtXlm(stroops?: bigint): string {
  if (stroops === undefined) return "—";
  return (Number(stroops) / 1e7).toFixed(4).replace(/\.?0+$/, "");
}

export function LenderCard() {
  const { address } = useWallet();
  const { data: lp, isLoading: lpLoading } = useLpBalance(address);
  const { data: pool } = usePoolState();
  const deposit = useDeposit(address);
  const withdraw = useWithdraw(address);

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  if (!address) return null;

  const claimValueStroops =
    lp !== undefined && pool && pool.totalShares > 0n
      ? (lp * pool.totalXlm) / pool.totalShares
      : 0n;

  async function onDeposit(e: FormEvent) {
    e.preventDefault();
    try {
      await deposit.mutateAsync(depositAmount);
      setDepositAmount("");
    } catch {
      // surfaced below
    }
  }

  async function onWithdraw(e: FormEvent) {
    e.preventDefault();
    try {
      await withdraw.mutateAsync(withdrawAmount);
      setWithdrawAmount("");
    } catch {
      // surfaced below
    }
  }

  const err = deposit.error
    ? toError(deposit.error)
    : withdraw.error
      ? toError(withdraw.error)
      : null;
  const pending = deposit.isPending || withdraw.isPending;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="text-xs uppercase tracking-wider text-subtle">Lender</div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-subtle">
            LP Shares
          </div>
          <div className="mt-1 font-mono text-xl font-semibold tracking-tight">
            {lpLoading ? (
              <span className="inline-block h-6 w-16 animate-pulse rounded bg-elevated" />
            ) : (
              fmtXlm(lp)
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-subtle">
            Claim Value
          </div>
          <div className="mt-1 font-mono text-xl font-semibold tracking-tight">
            {fmtXlm(claimValueStroops)} <span className="text-xs font-normal text-muted">XLM</span>
          </div>
        </div>
      </div>

      <form onSubmit={onDeposit} className="mt-4 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-subtle">
          Deposit
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.0000001"
            min="0.0000001"
            placeholder="XLM amount"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            required
            className={`${inputCls} font-mono`}
          />
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg transition-colors hover:bg-cyan-300 disabled:opacity-50"
          >
            {deposit.isPending ? "..." : "Deposit"}
          </button>
        </div>
      </form>

      <form onSubmit={onWithdraw} className="mt-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-subtle">
          Withdraw
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.0000001"
            min="0.0000001"
            placeholder="LP shares"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            required
            className={`${inputCls} font-mono`}
          />
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded-md border border-border bg-elevated px-3 py-2 text-sm font-medium text-fg transition-colors hover:border-accent disabled:opacity-50"
          >
            {withdraw.isPending ? "..." : "Withdraw"}
          </button>
        </div>
      </form>

      {err && (
        <div className="mt-3 rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          {err instanceof UserRejectedError
            ? "You rejected the request in your wallet."
            : err instanceof InsufficientBalanceError
              ? "Not enough XLM in your account."
              : `Failed: ${err.message}`}
        </div>
      )}
    </div>
  );
}
