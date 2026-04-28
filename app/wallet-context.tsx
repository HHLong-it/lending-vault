"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { ensureKit, StellarWalletsKit } from "@/lib/wallets";

type WalletState = {
  address: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    ensureKit();
  }, []);

  const connect = useCallback(async () => {
    try {
      ensureKit();
      const { address } = await StellarWalletsKit.authModal();
      setAddress(address);
    } catch (e) {
      // dismissed modal, user-rejected, or wallet not installed -
      // do not let it bubble to the runtime-error overlay
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null && "message" in e
            ? String((e as { message: unknown }).message)
            : String(e);
      console.warn("[wallet] connect cancelled:", msg);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await StellarWalletsKit.disconnect();
    } catch (e) {
      console.warn("[wallet] disconnect error:", e);
    }
    setAddress(null);
  }, []);

  return (
    <WalletContext.Provider value={{ address, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
