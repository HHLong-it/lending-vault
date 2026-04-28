"use client";

import { useWallet } from "@/app/wallet-context";

function shorten(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function WalletButton() {
  const { address, connect, disconnect } = useWallet();

  if (address) {
    return (
      <button
        onClick={disconnect}
        title="Click to disconnect"
        className="shrink-0 rounded-md border border-border bg-surface px-3 py-2 text-xs transition-colors hover:border-accent"
      >
        <span className="font-mono">{shorten(address)}</span>
        <span className="hidden text-subtle sm:inline"> · Disconnect</span>
      </button>
    );
  }

  return (
    <button
      onClick={connect}
      className="shrink-0 rounded-md bg-accent px-3 py-2 text-xs font-medium text-bg transition-colors hover:bg-cyan-300"
    >
      Connect Wallet
    </button>
  );
}
