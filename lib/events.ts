import { rpc, xdr, scValToNative } from "@stellar/stellar-sdk";
import { sorobanRpc } from "./soroban";

export type VaultEventKind =
  | "deposit"
  | "withdraw"
  | "borrow"
  | "repay"
  | "liquidate";

export type ContractEvent = {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
  kind: VaultEventKind;
  actor: string;
  borrower?: string;
  amounts: bigint[];
};

// Topic counts mirror the contract emits:
//   deposit/withdraw/borrow/repay -> (kind, actor)             = 2 topics
//   liquidate                     -> (kind, liquidator, borrower) = 3 topics
// The Soroban RPC topic filter requires the count to match exactly,
// so 2-topic events get silently dropped if we ask for 3.
const TOPIC_LAYOUT: { kind: VaultEventKind; topicCount: 2 | 3 }[] = [
  { kind: "deposit", topicCount: 2 },
  { kind: "withdraw", topicCount: 2 },
  { kind: "borrow", topicCount: 2 },
  { kind: "repay", topicCount: 2 },
  { kind: "liquidate", topicCount: 3 },
];

export async function getRecentEvents(
  contractId: string,
  windowLedgers = 5000
): Promise<ContractEvent[]> {
  const latest = await sorobanRpc.getLatestLedger();
  const startLedger = Math.max(1, latest.sequence - windowLedgers);

  const filters = TOPIC_LAYOUT.map(({ kind, topicCount }) => {
    const symbol = xdr.ScVal.scvSymbol(kind).toXDR("base64");
    const topics = topicCount === 2 ? [symbol, "*"] : [symbol, "*", "*"];
    return {
      type: "contract" as const,
      contractIds: [contractId],
      topics: [topics],
    };
  });

  const all: ContractEvent[] = [];
  for (const filter of filters) {
    try {
      const res = await sorobanRpc.getEvents({
        startLedger,
        filters: [filter],
        limit: 50,
      });
      for (const e of res.events) {
        all.push(decode(e));
      }
    } catch {
      // tolerate per-topic failures so the feed renders partial data
    }
  }

  return all.sort((a, b) => b.ledger - a.ledger).slice(0, 50);
}

function decode(e: rpc.Api.EventResponse): ContractEvent {
  const kind = scValToNative(e.topic[0]) as VaultEventKind;
  const actor = scValToNative(e.topic[1]) as string;
  const maybeBorrower =
    e.topic.length > 2 ? (scValToNative(e.topic[2]) as string) : undefined;

  const value = scValToNative(e.value);
  const amounts: bigint[] = Array.isArray(value)
    ? (value as unknown[]).map((v) => BigInt(v as bigint | number | string))
    : [BigInt(value as bigint | number | string)];

  return {
    id: e.id,
    ledger: e.ledger,
    ledgerClosedAt: e.ledgerClosedAt,
    txHash: e.txHash,
    kind,
    actor,
    borrower: maybeBorrower,
    amounts,
  };
}
