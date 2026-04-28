import {
  Asset,
  BASE_FEE,
  Horizon,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";

export const networkPassphrase =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? Networks.TESTNET;

export const horizon = new Horizon.Server(HORIZON_URL);

export async function getXlmBalance(publicKey: string): Promise<string> {
  const account = await horizon.loadAccount(publicKey);
  const native = account.balances.find((b) => b.asset_type === "native");
  return native?.balance ?? "0";
}

export async function sendXlm(opts: {
  from: string;
  to: string;
  amount: string;
  memo?: string;
  signXdr: (xdr: string) => Promise<string>;
}): Promise<{ hash: string }> {
  const account = await horizon.loadAccount(opts.from);
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: opts.to,
        asset: Asset.native(),
        amount: opts.amount,
      })
    )
    .setTimeout(30);
  if (opts.memo) builder.addMemo(Memo.text(opts.memo));
  const tx = builder.build();

  const signedXdr = await opts.signXdr(tx.toXDR());
  const signed = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  const result = await horizon.submitTransaction(signed);
  return { hash: result.hash };
}
