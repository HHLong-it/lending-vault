"use client";

import { useQuery } from "@tanstack/react-query";
import { getXlmBalance } from "@/lib/stellar";

export function useBalance(address: string | null) {
  return useQuery({
    queryKey: ["balance", address],
    queryFn: () => getXlmBalance(address!),
    enabled: !!address,
    refetchInterval: 30_000,
  });
}
