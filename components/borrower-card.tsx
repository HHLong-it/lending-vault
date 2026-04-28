"use client";

import { useState, type FormEvent } from "react";
import { useWallet } from "@/app/wallet-context";
import { useLoan } from "@/hooks/use-pool";
import { useBorrow, useRepay } from "@/hooks/use-vault-actions";
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

function timeLeft(deadline: bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const seconds = Number(deadline) - now;
  if (seconds <= 0) return "Past deadline";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  if (days > 0) return `${days}d ${hours}h left`;
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m left`;
}

export function BorrowerCard() {
  const { address } = useWallet();
  const { data, isLoading } = useLoan(address);
  const borrow = useBorrow(address);
  const repay = useRepay(address);

  const [principal, setPrincipal] = useState("");
  const [collateral, setCollateral] = useState("");
  const [days, setDays] = useState("7");

  if (!address) return null;

  const hasOpenLoan = !!data?.loan;

  async function onBorrow(e: FormEvent) {
    e.preventDefault();
    try {
      await borrow.mutateAsync({
        principal,
        collateral,
        durationDays: parseInt(days, 10),
      });
      setPrincipal("");
      setCollateral("");
    } catch {
      // surfaced below
    }
  }

  async function onRepay() {
    try {
      await repay.mutateAsync();
    } catch {
      // surfaced below
    }
  }

  const err = borrow.error
    ? toError(borrow.error)
    : repay.error
      ? toError(repay.error)
      : null;

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="text-xs uppercase tracking-wider text-subtle">
          Borrower
        </div>
        <div className="mt-3 h-20 animate-pulse rounded bg-elevated" />
      </div>
    );
  }

  if (hasOpenLoan && data.loan) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-subtle">
            Open Loan
          </div>
          <div className="text-xs text-accent">{timeLeft(data.loan.deadline)}</div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Principal" value={`${fmtXlm(data.loan.principal)} XLM`} />
          <Stat label="Collateral" value={`${fmtXlm(data.loan.collateral)} XLM`} />
          <Stat label="Debt Now" value={`${fmtXlm(data.debt)} XLM`} />
        </div>
        <button
          onClick={onRepay}
          disabled={repay.isPending}
          className="mt-4 w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg transition-colors hover:bg-cyan-300 disabled:opacity-50"
        >
          {repay.isPending ? "Repaying..." : "Repay & Reclaim Collateral"}
        </button>
        {err && (
          <div className="mt-3 rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
            {err instanceof UserRejectedError
              ? "You rejected the request in your wallet."
              : `Failed: ${err.message}`}
          </div>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={onBorrow}
      className="space-y-3 rounded-lg border border-border bg-surface p-5"
    >
      <div className="text-xs uppercase tracking-wider text-subtle">Borrower</div>
      <p className="text-xs text-muted">
        Post collateral, borrow XLM at 5% APR. Min collateral is 110% of the
        loan principal. If you miss the deadline, anyone can liquidate the
        position and claim your collateral.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <input
          type="number"
          step="0.0000001"
          min="0.0000001"
          placeholder="Principal (XLM)"
          value={principal}
          onChange={(e) => setPrincipal(e.target.value)}
          required
          className={`${inputCls} font-mono`}
        />
        <input
          type="number"
          step="0.0000001"
          min="0.0000001"
          placeholder="Collateral (XLM)"
          value={collateral}
          onChange={(e) => setCollateral(e.target.value)}
          required
          className={`${inputCls} font-mono`}
        />
      </div>
      <div className="flex items-center gap-2">
        <select
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className={inputCls}
        >
          <option value="1">1 day</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
        </select>
        <button
          type="submit"
          disabled={borrow.isPending}
          className="shrink-0 rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg transition-colors hover:bg-cyan-300 disabled:opacity-50"
        >
          {borrow.isPending ? "Opening..." : "Open Loan"}
        </button>
      </div>
      {err && (
        <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          {err instanceof UserRejectedError
            ? "You rejected the request in your wallet."
            : err instanceof InsufficientBalanceError
              ? "Not enough XLM in your account to cover collateral."
              : `Failed: ${err.message}`}
        </div>
      )}
    </form>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-subtle">
        {label}
      </div>
      <div className="mt-1 font-mono text-base font-semibold">{value}</div>
    </div>
  );
}
