// Adds an offline key to Pocket's platform account, so a leaked server key can
// be removed without losing the account. Escrows store the account's address,
// not its key, so nothing on chain has to change.
//
// After it runs:
//   - the server key (weight 1) still signs every escrow step and pays fees;
//   - changing signers or thresholds needs weight 2, which only the offline
//     key has: the server key alone cannot hand the account to anyone;
//   - the offline key alone can remove the server key (docs/security.md).
//
// Generate the offline key on a device that never touches the server (a
// hardware wallet, or Stellar Lab on an offline machine) and keep its secret
// there. Only its public key goes here.
//
//   OFFLINE_SIGNER=G... bun --env-file=.env scripts/platform-cosigner.ts           # shows the plan
//   OFFLINE_SIGNER=G... bun --env-file=.env scripts/platform-cosigner.ts --apply   # sends it
import {
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  StrKey,
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
const offline = process.env.OFFLINE_SIGNER;
if (!secret) throw new Error('Set STELLAR_PLATFORM_SECRET in apps/api/.env');
if (!offline || !StrKey.isValidEd25519PublicKey(offline)) {
  throw new Error('Set OFFLINE_SIGNER to the public key (G...) of the offline key');
}

const server = Keypair.fromSecret(secret);
if (offline === server.publicKey()) {
  throw new Error('The offline key must be a different key from the server key');
}
const horizon = new Horizon.Server(horizonUrl);
const account = await horizon.loadAccount(server.publicKey());

const current = account.signers.map((s) => `${s.key} weight ${s.weight}`).join(', ');
console.log(`Network:    ${network}`);
console.log(`Account:    ${server.publicKey()}`);
console.log(`Signers:    ${current}`);
console.log(
  `Thresholds: low ${account.thresholds.low_threshold}, medium ${account.thresholds.med_threshold}, high ${account.thresholds.high_threshold}`,
);
if (account.signers.some((s) => s.key === offline)) {
  console.log('The offline key is already a signer. Nothing to do.');
  process.exit(0);
}
if (account.signers.length > 1 || account.thresholds.high_threshold > 0) {
  throw new Error('The account already has other signers or thresholds. Review it by hand');
}

console.log('\nPlan, in one transaction signed by the server key:');
console.log(`  add ${offline} with weight 2`);
console.log('  server key weight 1; thresholds low 1, medium 1, high 2');

if (!process.argv.includes('--apply')) {
  console.log('\nDry run. Add --apply to send it.');
  process.exit(0);
}

const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase })
  .addOperation(Operation.setOptions({ signer: { ed25519PublicKey: offline, weight: 2 } }))
  .addOperation(
    Operation.setOptions({
      masterWeight: 1,
      lowThreshold: 1,
      medThreshold: 1,
      highThreshold: 2,
    }),
  )
  .setTimeout(60)
  .build();
tx.sign(server);
const result = await horizon.submitTransaction(tx);
console.log(`\nDone: ${result.hash}`);
console.log('The platform monitor will flag this transaction: it was not sent by the API.');
