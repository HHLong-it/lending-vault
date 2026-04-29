import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  rpc,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { networkPassphrase } from "./stellar";

const RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";

// fallback "source" account for read-only simulations. any valid g-address works.
// the simulator doesn't actually use this for sequence; it just needs a shape.
const READ_SOURCE =
  process.env.NEXT_PUBLIC_READ_SOURCE ??
  "GBZGPMRLYDWCC6GKX5B7HYFYQWZOUHND3RMGGR5R7TYEA7SE7QGZ5QO7";

export const sorobanRpc = new rpc.Server(RPC_URL);

export type ScArg = xdr.ScVal;

export function addrArg(s: string): ScArg {
  return new Address(s).toScVal();
}

export function i128Arg(stroops: bigint): ScArg {
  return nativeToScVal(stroops, { type: "i128" });
}

export function strArg(s: string): ScArg {
  return nativeToScVal(s, { type: "string" });
}

export function u64Arg(n: bigint | number): ScArg {
  return nativeToScVal(BigInt(n), { type: "u64" });
}

export async function invokeContract(opts: {
  contractId: string;
  method: string;
  args: ScArg[];
  source: string;
  signXdr: (xdr: string) => Promise<string>;
}): Promise<{ hash: string }> {
  const account = await sorobanRpc.getAccount(opts.source);
  const contract = new Contract(opts.contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(opts.method, ...opts.args))
    .setTimeout(180)
    .build();

  const sim = await sorobanRpc.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }

  const prepared = rpc.assembleTransaction(tx, sim).build();
  const signedXdr = await opts.signXdr(prepared.toXDR());
  const signed = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);

  const sendRes = await sorobanRpc.sendTransaction(signed);
  if (sendRes.status === "ERROR") {
    throw new Error(describeSendError(sendRes));
  }
  const hash = sendRes.hash;

  let result = await sorobanRpc.getTransaction(hash);
  let tries = 0;
  while (result.status === "NOT_FOUND" && tries < 30) {
    await new Promise((r) => setTimeout(r, 1000));
    result = await sorobanRpc.getTransaction(hash);
    tries++;
  }
  if (result.status === "FAILED") {
    throw new Error(describeFailure(result, hash));
  }
  return { hash };
}

const TX_RESULT_CODES: Record<string, string> = {
  txTooLate: "Transaction expired before it landed. The wallet held the signature past the timebound — try again.",
  txTooEarly: "Transaction's minTime is in the future. Check your system clock.",
  txBadSeq: "Sequence number mismatch. Reload and try again.",
  txInsufficientFee: "Network fee was too low for current load. Try again.",
  txInsufficientBalance: "Account balance can't cover this transaction's fee.",
  txNoAccount: "Source account doesn't exist on the network. Fund it from friendbot.",
  txBadAuth: "Signature didn't match the source account.",
  txBadAuthExtra: "Extra signatures attached that weren't required.",
  txInternalError: "Network internal error. Try again in a moment.",
  txSorobanInvalid: "Soroban transaction was rejected as invalid.",
  txMalformedNotEnoughTimeBounds: "Transaction is missing required Soroban timebounds.",
};

function describeSendError(res: rpc.Api.SendTransactionResponse): string {
  const r = res as unknown as Record<string, unknown>;
  const errorResult = r.errorResult as
    | { result?: () => { switch?: () => { name?: string } } }
    | undefined;
  let codeName: string | undefined;
  try {
    codeName = errorResult?.result?.()?.switch?.()?.name;
  } catch {
    // ignore — fall through
  }
  if (codeName && TX_RESULT_CODES[codeName]) {
    return TX_RESULT_CODES[codeName];
  }
  if (codeName) {
    return `Send failed: ${codeName}`;
  }
  const errorXdr = r.errorResultXdr ?? r.errorResult;
  let raw = "";
  if (typeof errorXdr === "string") raw = errorXdr;
  else if (errorXdr && typeof (errorXdr as { toXDR?: (f: string) => string }).toXDR === "function") {
    try {
      raw = (errorXdr as { toXDR: (f: string) => string }).toXDR("base64");
    } catch {
      // ignore
    }
  }
  return raw ? `Send failed (raw): ${raw}` : "Send failed.";
}

function describeFailure(result: rpc.Api.GetTransactionResponse, hash: string): string {
  const xdrStrings: string[] = [];
  const r = result as unknown as Record<string, unknown>;
  const push = (v: unknown) => {
    if (!v) return;
    if (typeof v === "string") xdrStrings.push(v);
    else if (typeof (v as { toXDR?: (f: string) => string }).toXDR === "function") {
      try {
        xdrStrings.push((v as { toXDR: (f: string) => string }).toXDR("base64"));
      } catch {
        // ignore xdr serialization errors
      }
    }
  };
  push(r.resultXdr);
  push(r.resultMetaXdr);
  const diag = r.diagnosticEventsXdr;
  if (Array.isArray(diag)) for (const d of diag) push(d);

  const events = collectDiagnosticEvents(r);
  for (const ev of events) {
    try {
      xdrStrings.push(ev.toXDR("base64"));
    } catch {
      // ignore
    }
    const code = readContractErrorCode(ev);
    if (code !== null) {
      return `Error(Contract, #${code}) on tx ${hash}`;
    }
  }

  const explorer = `https://stellar.expert/explorer/testnet/tx/${hash}`;
  const tail = xdrStrings.length
    ? ` Raw: ${xdrStrings.join(" | ").slice(0, 600)}`
    : "";
  return `Tx ${hash} failed on chain. ${explorer}${tail}`;
}

function collectDiagnosticEvents(r: Record<string, unknown>): xdr.DiagnosticEvent[] {
  const out: xdr.DiagnosticEvent[] = [];
  const raw = r.diagnosticEventsXdr;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      try {
        if (typeof item === "string") {
          out.push(xdr.DiagnosticEvent.fromXDR(item, "base64"));
        } else if (item && typeof (item as xdr.DiagnosticEvent).event === "function") {
          out.push(item as xdr.DiagnosticEvent);
        }
      } catch {
        // skip malformed
      }
    }
  }
  try {
    const meta = r.resultMetaXdr as xdr.TransactionMeta | undefined;
    if (meta && typeof meta.switch === "function") {
      const v = Number(meta.switch());
      const sorobanMeta =
        v === 3
          ? meta.v3().sorobanMeta()
          : v === 4
            ? (meta as unknown as { v4: () => { sorobanMeta: () => xdr.SorobanTransactionMeta | null } }).v4().sorobanMeta()
            : null;
      const events = sorobanMeta?.diagnosticEvents() ?? [];
      out.push(...events);
    }
  } catch {
    // older meta versions don't have soroban events
  }
  return out;
}

function readContractErrorCode(ev: xdr.DiagnosticEvent): number | null {
  try {
    const body = ev.event().body().value() as { topics?: () => xdr.ScVal[]; data?: () => xdr.ScVal };
    const candidates: xdr.ScVal[] = [];
    if (typeof body?.topics === "function") candidates.push(...body.topics());
    if (typeof body?.data === "function") {
      const d = body.data();
      if (d) candidates.push(d);
    }
    for (const c of candidates) {
      if (c.switch().name === "scvError") {
        const err = c.error();
        if (err.switch().name === "sceContract") {
          return err.contractCode();
        }
      }
    }
  } catch {
    // unparseable event
  }
  return null;
}

export async function readContract<T = unknown>(opts: {
  contractId: string;
  method: string;
  args: ScArg[];
  source?: string;
}): Promise<T> {
  // reads don't submit a tx; sequence number doesn't matter so skip getAccount
  const account = new Account(opts.source ?? READ_SOURCE, "0");
  const contract = new Contract(opts.contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(opts.method, ...opts.args))
    .setTimeout(30)
    .build();

  const sim = await sorobanRpc.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }
  if (!("result" in sim) || !sim.result?.retval) {
    throw new Error("no return value from contract");
  }
  return scValToNative(sim.result.retval) as T;
}

export function xlmToStroops(xlm: string): bigint {
  const [whole, frac = ""] = xlm.split(".");
  const padded = (frac + "0000000").slice(0, 7);
  return BigInt(whole) * 10_000_000n + BigInt(padded || "0");
}
