import {
  StellarWalletsKit,
  Networks,
} from "@creit.tech/stellar-wallets-kit";
import {
  FreighterModule,
  FREIGHTER_ID,
} from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { LobstrModule } from "@creit.tech/stellar-wallets-kit/modules/lobstr";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";

let initialized = false;

export function ensureKit() {
  if (typeof window === "undefined") return;
  if (initialized) return;
  StellarWalletsKit.init({
    network: Networks.TESTNET,
    selectedWalletId: FREIGHTER_ID,
    modules: [
      new FreighterModule(),
      new xBullModule(),
      new LobstrModule(),
      new AlbedoModule(),
    ],
  });
  initialized = true;
}

export { StellarWalletsKit };
