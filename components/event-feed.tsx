"use client";

import { useContractEvents } from "@/hooks/use-contract-events";
import type { ContractEvent } from "@/lib/events";

function shortAddr(a: string) {
  return `${a.slice(0, 4)}...${a.slice(-4)}`;
}

function fmtAmount(stroops: bigint) {
  return (Number(stroops) / 1e7).toFixed(4).replace(/\.?0+$/, "");
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const s = Math.floor(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const KIND_COLOR: Record<string, string> = {
  deposit: "border-accent/40 text-accent",
  withdraw: "border-muted/40 text-muted",
  borrow: "border-warn/40 text-warn",
  repay: "border-success/40 text-success",
  liquidate: "border-danger/40 text-danger",
};

export function EventFeed() {
  const { data, isLoading, isError } = useContractEvents();

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-subtle">
        Activity
        <span className="text-[10px] font-mono text-accent tracking-[0.3em]">▌ TAPE</span>
      </div>
      {isLoading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-elevated" />
          ))}
        </div>
      ) : isError ? (
        <div className="mt-3 text-sm text-danger">Failed to load events</div>
      ) : !data || data.length === 0 ? (
        <div className="mt-3 text-sm text-subtle">
          No vault activity yet. Deposit, borrow, or wait for the first event.
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {data.map((e) => (
            <Row key={e.id} e={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ e }: { e: ContractEvent }) {
  const kindCls = KIND_COLOR[e.kind] ?? "border-border text-fg";
  return (
    <li className={`border-l-2 pl-3 text-sm ${kindCls}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <span className="font-mono text-xs uppercase tracking-wider">
            {e.kind}
          </span>
          <span className="text-subtle"> · </span>
          <span className="font-mono text-xs">{shortAddr(e.actor)}</span>
          {e.borrower && (
            <>
              <span className="text-subtle"> ↪ </span>
              <span className="font-mono text-xs">{shortAddr(e.borrower)}</span>
            </>
          )}
        </div>
        <a
          href={`https://stellar.expert/explorer/testnet/tx/${e.txHash}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-subtle hover:text-accent"
        >
          {timeAgo(e.ledgerClosedAt)}
        </a>
      </div>
      <div className="mt-1 font-mono text-xs text-muted">{summarize(e)}</div>
    </li>
  );
}

function summarize(e: ContractEvent): string {
  const [a, b, c] = e.amounts;
  switch (e.kind) {
    case "deposit":
      return `${fmtAmount(a)} XLM in -> ${fmtAmount(b)} LP shares out`;
    case "withdraw":
      return `${fmtAmount(a)} LP shares in -> ${fmtAmount(b)} XLM out`;
    case "borrow":
      return `${fmtAmount(a)} XLM borrowed against ${fmtAmount(b)} XLM collateral, deadline ${new Date(Number(c) * 1000).toLocaleDateString()}`;
    case "repay":
      return `${fmtAmount(a)} XLM principal + ${fmtAmount(b)} XLM interest`;
    case "liquidate":
      return `claimed ${fmtAmount(a)} XLM collateral, settled ${fmtAmount(b)} XLM debt`;
    default:
      return e.amounts.map(fmtAmount).join(" · ");
  }
}
