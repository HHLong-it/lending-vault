"use client";

import { useState } from "react";
import { useWallet } from "@/app/wallet-context";
import { BalanceCard } from "./balance-card";
import { LenderCard } from "./lender-card";
import { BorrowerCard } from "./borrower-card";
import { EventFeed } from "./event-feed";

type Side = "lend" | "borrow";

export function Dashboard() {
  const { address, connect } = useWallet();
  const [mobileSide, setMobileSide] = useState<Side>("lend");

  return (
    <div className="mt-6 space-y-6">
      {!address && <ConnectCta onConnect={connect} />}

      {address && (
        <>
          <div className="lg:hidden">
            <SideToggle value={mobileSide} onChange={setMobileSide} />
          </div>

          <BalanceCard />

          <div className="grid gap-4 lg:grid-cols-2 lg:gap-0">
            <div
              className={`relative rounded-lg rounded-r-none border border-border bg-surface p-5 sm:p-6 lg:rounded-r-none lg:border-r-0 ${
                mobileSide === "lend" ? "block" : "hidden lg:block"
              }`}
            >
              <PaneHeader
                eyebrow="Side A"
                title="Lend"
                accent="bg-accent"
                desc="Deposit XLM, earn LP shares, withdraw proportional value."
              />
              <div className="mt-5">
                <LenderCard />
              </div>
            </div>

            <div
              className={`relative rounded-lg rounded-l-none border border-border bg-elevated p-5 sm:p-6 ${
                mobileSide === "borrow" ? "block" : "hidden lg:block"
              }`}
            >
              <PaneHeader
                eyebrow="Side B"
                title="Borrow"
                accent="bg-warn"
                desc="Post 110% collateral, draw at 5% APR, repay before deadline or get liquidated."
              />
              <div className="mt-5">
                <BorrowerCard />
              </div>
            </div>
          </div>
        </>
      )}

      <EventFeed />
    </div>
  );
}

function PaneHeader({
  eyebrow,
  title,
  desc,
  accent,
}: {
  eyebrow: string;
  title: string;
  desc: string;
  accent: string;
}) {
  return (
    <div className="border-b border-border pb-4">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-6 rounded-full ${accent}`} />
        <span className="text-[10px] uppercase tracking-[0.18em] text-subtle">
          {eyebrow}
        </span>
      </div>
      <h2 className="mt-2 text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-xs text-muted">{desc}</p>
    </div>
  );
}

function SideToggle({
  value,
  onChange,
}: {
  value: Side;
  onChange: (s: Side) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-elevated p-1 text-xs">
      <button
        type="button"
        onClick={() => onChange("lend")}
        className={`rounded py-1.5 font-medium transition-colors ${
          value === "lend" ? "bg-accent text-bg" : "text-muted hover:text-fg"
        }`}
      >
        Lend
      </button>
      <button
        type="button"
        onClick={() => onChange("borrow")}
        className={`rounded py-1.5 font-medium transition-colors ${
          value === "borrow" ? "bg-warn text-bg" : "text-muted hover:text-fg"
        }`}
      >
        Borrow
      </button>
    </div>
  );
}

function ConnectCta({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="grid gap-0 rounded-lg border border-border bg-surface lg:grid-cols-2">
      <div className="rounded-l-lg border-b border-border p-6 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-6 rounded-full bg-accent" />
          <span className="text-[10px] uppercase tracking-[0.18em] text-subtle">
            Side A
          </span>
        </div>
        <h2 className="mt-2 text-lg font-semibold">Lend XLM, Earn Yield</h2>
        <p className="mt-2 text-sm text-muted">
          Deposit XLM into the vault. Receive LP shares (SEP-41) representing
          your stake. Borrowers pay 5% APR; lenders accrue proportionally.
        </p>
      </div>
      <div className="rounded-r-lg bg-elevated p-6">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-6 rounded-full bg-warn" />
          <span className="text-[10px] uppercase tracking-[0.18em] text-subtle">
            Side B
          </span>
        </div>
        <h2 className="mt-2 text-lg font-semibold">Borrow Against Collateral</h2>
        <p className="mt-2 text-sm text-muted">
          Post 110% collateral and draw XLM at 5% APR. Repay before the deadline
          or any third party can liquidate the position.
        </p>
      </div>
      <div className="col-span-full border-t border-border p-5 text-center">
        <button
          onClick={onConnect}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg transition-colors hover:bg-cyan-300"
        >
          Connect Wallet
        </button>
      </div>
    </div>
  );
}
