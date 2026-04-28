"use client";

import { useQuery } from "@tanstack/react-query";
import { readContract, addrArg } from "@/lib/soroban";
import { getRecentEvents } from "@/lib/events";

const VAULT_ID = process.env.NEXT_PUBLIC_MAIN_CONTRACT_ID;
const LP_ID = process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ID;

export type PoolState = {
  totalXlm: bigint;
  borrowedXlm: bigint;
  availableXlm: bigint;
  totalShares: bigint;
  utilizationBps: number;
  sharePriceMicro: bigint;
};

export function usePoolState() {
  return useQuery<PoolState>({
    queryKey: ["pool-state", VAULT_ID, LP_ID],
    queryFn: async () => {
      if (!VAULT_ID) throw new Error("vault contract not configured");
      const [tup, totalShares] = await Promise.all([
        readContract<[bigint, bigint]>({
          contractId: VAULT_ID,
          method: "pool_state",
          args: [],
        }),
        LP_ID
          ? readContract<bigint>({
              contractId: LP_ID,
              method: "total_supply",
              args: [],
            })
          : Promise.resolve(0n),
      ]);
      const [totalXlm, borrowedXlm] = tup;
      const availableXlm = totalXlm > borrowedXlm ? totalXlm - borrowedXlm : 0n;
      const utilizationBps =
        totalXlm > 0n ? Number((borrowedXlm * 10_000n) / totalXlm) : 0;
      const sharePriceMicro =
        totalShares > 0n ? (totalXlm * 1_000_000n) / totalShares : 1_000_000n;
      return {
        totalXlm,
        borrowedXlm,
        availableXlm,
        totalShares,
        utilizationBps,
        sharePriceMicro,
      };
    },
    enabled: !!VAULT_ID,
    refetchInterval: 8_000,
  });
}

export function useLpBalance(address: string | null) {
  return useQuery<bigint>({
    queryKey: ["lp-balance", LP_ID, address],
    queryFn: async () => {
      if (!LP_ID || !address) return 0n;
      return readContract<bigint>({
        contractId: LP_ID,
        method: "balance",
        args: [addrArg(address)],
        source: address,
      });
    },
    enabled: !!LP_ID && !!address,
    refetchInterval: 8_000,
  });
}

export type Loan = {
  principal: bigint;
  collateral: bigint;
  opened_at: bigint;
  deadline: bigint;
};

export type LiquidatablePosition = {
  borrower: string;
  loan: Loan;
  debt: bigint;
  profit: bigint;
};

export function useLiquidatablePositions() {
  return useQuery<LiquidatablePosition[]>({
    queryKey: ["liquidatable", VAULT_ID],
    queryFn: async () => {
      if (!VAULT_ID) return [];
      const events = await getRecentEvents(VAULT_ID).catch(() => []);
      const borrowers = Array.from(
        new Set(
          events
            .filter((e) => e.kind === "borrow")
            .map((e) => e.actor)
        )
      );
      if (borrowers.length === 0) return [];

      const nowSec = BigInt(Math.floor(Date.now() / 1000));
      const positions = await Promise.all(
        borrowers.map(async (borrower) => {
          const [loan, debt] = await Promise.all([
            readContract<Loan | undefined>({
              contractId: VAULT_ID,
              method: "loan_of",
              args: [addrArg(borrower)],
            }).catch(() => undefined),
            readContract<bigint>({
              contractId: VAULT_ID,
              method: "debt_of",
              args: [addrArg(borrower)],
            }).catch(() => 0n),
          ]);
          if (!loan) return null;
          if (loan.deadline > nowSec) return null;
          const profit =
            loan.collateral > debt ? loan.collateral - debt : 0n;
          return { borrower, loan, debt, profit };
        })
      );
      return positions
        .filter((p): p is LiquidatablePosition => p !== null)
        .sort((a, b) => Number(a.loan.deadline - b.loan.deadline));
    },
    enabled: !!VAULT_ID,
    refetchInterval: 8_000,
  });
}

export function useLoan(address: string | null) {
  return useQuery<{ loan: Loan | null; debt: bigint }>({
    queryKey: ["loan", VAULT_ID, address],
    queryFn: async () => {
      if (!VAULT_ID || !address) return { loan: null, debt: 0n };
      const [loanRaw, debt] = await Promise.all([
        readContract<Loan | undefined>({
          contractId: VAULT_ID,
          method: "loan_of",
          args: [addrArg(address)],
          source: address,
        }),
        readContract<bigint>({
          contractId: VAULT_ID,
          method: "debt_of",
          args: [addrArg(address)],
          source: address,
        }),
      ]);
      return { loan: loanRaw ?? null, debt };
    },
    enabled: !!VAULT_ID && !!address,
    refetchInterval: 8_000,
  });
}
