"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { networkPassphrase } from "@/lib/stellar";
import {
  invokeContract,
  readContract,
  addrArg,
  i128Arg,
  u64Arg,
  xlmToStroops,
} from "@/lib/soroban";
import { StellarWalletsKit } from "@/lib/wallets";

const VAULT_ID = process.env.NEXT_PUBLIC_MAIN_CONTRACT_ID;

function signer(address: string) {
  return async (xdr: string) => {
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
      address,
      networkPassphrase,
    });
    return signedTxXdr;
  };
}

function ensureVaultId() {
  if (!VAULT_ID) throw new Error("NEXT_PUBLIC_MAIN_CONTRACT_ID is not set");
  return VAULT_ID;
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["balance"] });
  qc.invalidateQueries({ queryKey: ["pool-state"] });
  qc.invalidateQueries({ queryKey: ["lp-balance"] });
  qc.invalidateQueries({ queryKey: ["loan"] });
  qc.invalidateQueries({ queryKey: ["events"] });
}

export function useDeposit(address: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (xlm: string): Promise<{ hash: string }> => {
      if (!address) throw new Error("connect a wallet first");
      const id = ensureVaultId();
      return invokeContract({
        contractId: id,
        method: "deposit",
        args: [addrArg(address), i128Arg(xlmToStroops(xlm))],
        source: address,
        signXdr: signer(address),
      });
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useWithdraw(address: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (shares: string): Promise<{ hash: string }> => {
      if (!address) throw new Error("connect a wallet first");
      const id = ensureVaultId();
      return invokeContract({
        contractId: id,
        method: "withdraw",
        args: [addrArg(address), i128Arg(xlmToStroops(shares))],
        source: address,
        signXdr: signer(address),
      });
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useBorrow(address: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      principal: string;
      collateral: string;
      durationSeconds: number;
    }): Promise<{ hash: string }> => {
      if (!address) throw new Error("connect a wallet first");
      const id = ensureVaultId();
      if (input.durationSeconds <= 0) {
        throw new Error("duration must be greater than zero");
      }
      return invokeContract({
        contractId: id,
        method: "borrow",
        args: [
          addrArg(address),
          i128Arg(xlmToStroops(input.principal)),
          i128Arg(xlmToStroops(input.collateral)),
          u64Arg(Math.floor(input.durationSeconds)),
        ],
        source: address,
        signXdr: signer(address),
      });
    },
    onSuccess: () => invalidateAll(qc),
  });
}

// 0.001 XLM buffer over live debt — covers any interest that accrues between
// our quote and the host re-checking debt at submit time. Excess goes to the
// pool. Picks a value much larger than the per-second interest tick (~2 stroops
// for typical loans) so we never trip InsufficientPayment.
const REPAY_BUFFER_STROOPS = 10_000n;

export function useRepay(address: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ hash: string }> => {
      if (!address) throw new Error("connect a wallet first");
      const id = ensureVaultId();
      const live = await readContract<bigint>({
        contractId: id,
        method: "debt_of",
        args: [addrArg(address)],
        source: address,
      });
      const payment = (live ?? 0n) + REPAY_BUFFER_STROOPS;
      return invokeContract({
        contractId: id,
        method: "repay",
        args: [addrArg(address), i128Arg(payment)],
        source: address,
        signXdr: signer(address),
      });
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useLiquidate(address: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (borrower: string): Promise<{ hash: string }> => {
      if (!address) throw new Error("connect a wallet first");
      const id = ensureVaultId();
      return invokeContract({
        contractId: id,
        method: "liquidate",
        args: [addrArg(address), addrArg(borrower)],
        source: address,
        signXdr: signer(address),
      });
    },
    onSuccess: () => invalidateAll(qc),
  });
}
