// One-time setup of Pocket's platform account: Trustless Work requires the
// account in the escrow's `platformAddress` role to trust the escrow asset,
// and Pocket's 1% fee is paid to it in USDC. Safe to run again: it does
// nothing when the trustline is already there.
//
//   bun run stellar:setup
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

const network = process.env.STELLAR_NETWORK ?? 'testnet';
const horizonUrl =
  process.env.HORIZON_URL ||
  (network === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org');
const passphrase = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

const secret = process.env.STELLAR_PLATFORM_SECRET;
const issuer = process.env.USDC_ISSUER;
if (!secret || !issuer) {
  throw new Error('Set STELLAR_PLATFORM_SECRET and USDC_ISSUER in apps/api/.env');
}

const platform = Keypair.fromSecret(secret);
const usdc = new Asset('USDC', issuer);
const horizon = new Horizon.Server(horizonUrl);

const account = await horizon.loadAccount(platform.publicKey());
const trusts = account.balances.some(
  (balance) =>
    'asset_code' in balance &&
    balance.asset_code === 'USDC' &&
    balance.asset_issuer === issuer,
);

if (trusts) {
  console.log(`${platform.publicKey()} already trusts USDC on ${network}`);
} else {
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: passphrase,
  })
    .addOperation(Operation.changeTrust({ asset: usdc }))
    .setTimeout(60)
    .build();
  tx.sign(platform);
  const result = await horizon.submitTransaction(tx);
  console.log(
    `${platform.publicKey()} now trusts USDC on ${network} (tx ${result.hash})`,
  );
}
