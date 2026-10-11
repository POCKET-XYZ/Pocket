// Read-only check of everything Pocket needs on the Stellar network before it
// takes real users: the platform account, Trustless Work's escrow code, and a
// deploy Trustless Work builds right now, checked by the same policy the
// platform key signs under. Nothing is signed or sent.
//
//   bun run stellar:preflight                          (uses apps/api/.env)
//   bun --env-file=.env.mainnet scripts/preflight.ts   (another environment)
//
// Exits with 1 when any check fails.
import {
  Asset,
  contract,
  Horizon,
  Keypair,
  Networks,
  rpc,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  deployPolicy,
  MAX_PLATFORM_FEE_STROOPS,
} from '../src/modules/contracts/escrow-policies';
import { assertPlatformTx } from '../src/modules/stellar/platform-tx-policy';

const network = process.env.STELLAR_NETWORK ?? 'testnet';
const mainnet = network === 'mainnet';
const passphrase = mainnet ? Networks.PUBLIC : Networks.TESTNET;
const horizon = new Horizon.Server(
  process.env.HORIZON_URL ||
    (mainnet ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org'),
);
const soroban = new rpc.Server(
  process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
);
const twUrl = (process.env.TRUSTLESS_WORK_API_URL ?? '').replace(/\/+$/, '');
const twKey = process.env.TRUSTLESS_WORK_API_KEY ?? '';
const deployer = process.env.TRUSTLESS_WORK_DEPLOYER_CONTRACT_ID ?? '';
const wasmHash = process.env.TRUSTLESS_WORK_ESCROW_WASM_HASH ?? '';
const usdc = new Asset('USDC', process.env.USDC_ISSUER ?? '');
const platform = Keypair.fromSecret(process.env.STELLAR_PLATFORM_SECRET ?? '').publicKey();
const minXlm = Number(process.env.PLATFORM_MIN_XLM ?? 20);

/** The argument names each call must take, as Pocket's policies read them. */
const EXPECTED_ARGS: Record<string, string[]> = {
  release_milestone_funds: mainnet
    ? ['release_signer', 'milestone_index']
    : ['release_signer', 'trustless_work_address', 'milestone_index'],
  resolve_milestone_dispute: mainnet
    ? ['dispute_resolver', 'milestone_index', 'distributions']
    : ['dispute_resolver', 'milestone_index', 'trustless_work_address', 'distributions'],
};

let failures = 0;
function report(ok: boolean, what: string, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`);
}

const xlm = (stroops: number) => (stroops / 10_000_000).toFixed(4);

console.log(`Pocket preflight on ${network}, platform ${platform}\n`);

// The platform account: it exists, holds USDC for the fee, and has XLM for fees.
try {
  const account = await horizon.loadAccount(platform);
  const native = Number(
    account.balances.find((balance) => balance.asset_type === 'native')?.balance ?? 0,
  );
  const trusts = account.balances.some(
    (balance) =>
      'asset_code' in balance &&
      balance.asset_code === 'USDC' &&
      balance.asset_issuer === usdc.getIssuer(),
  );
  report(true, 'platform account exists');
  report(trusts, 'platform account trusts USDC', trusts ? '' : 'run bun run stellar:setup');
  report(native >= minXlm, 'platform account XLM', `${native} (alert below ${minXlm})`);
} catch {
  report(false, 'platform account exists', 'not on the network: send it XLM first');
}

// Trustless Work's escrow code, and the arguments Pocket's policies expect.
try {
  const spec = contract.Spec.fromWasm(
    await soroban.getContractWasmByHash(Buffer.from(wasmHash, 'hex')),
  );
  report(true, 'escrow code is on the network', wasmHash);
  for (const [fn, expected] of Object.entries(EXPECTED_ARGS)) {
    const names = spec.getFunc(fn).inputs.map((input) => input.name.toString());
    report(
      names.join(',') === expected.join(','),
      `${fn} takes what the policy checks`,
      names.join(', '),
    );
  }
} catch (error) {
  report(false, 'escrow code is on the network', (error as Error).message);
}

// A deploy Trustless Work builds now: the shape the policy signs, and its cost.
// A cost over the limit usually means the escrow code was archived and the
// deploy would pay its restore, which is Trustless Work's to do.
try {
  const engagementId = '00000000-0000-4000-8000-000000000000';
  const response = await fetch(`${twUrl}/deployer/multi-release`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': twKey },
    body: JSON.stringify({
      signer: platform,
      engagementId,
      title: 'Pocket preflight',
      description: 'Built to be checked, never signed or sent',
      roles: {
        approver: platform,
        serviceProvider: platform,
        platformAddress: platform,
        releaseSigner: platform,
        disputeResolver: platform,
      },
      platformFee: 1,
      milestones: [{ description: 'Preflight', amount: 1, receiver: platform }],
      trustline: { address: usdc.getIssuer(), symbol: 'USDC' },
    }),
  });
  const body = (await response.json()) as { unsignedTransaction?: string; message?: string };
  if (!body.unsignedTransaction) throw new Error(body.message ?? `HTTP ${response.status}`);

  const policy = deployPolicy(
    {
      platform,
      deployer,
      twFee: process.env.TRUSTLESS_WORK_FEE_ADDRESS || undefined,
      usdcContract: usdc.contractId(passphrase),
      escrowWasmHash: wasmHash,
      networkPassphrase: passphrase,
      network: mainnet ? 'mainnet' : 'testnet',
    },
    { contractId: engagementId, startup: platform, specialist: platform, milestoneAmounts: ['1.0000000'] },
  );
  // Shape first, with the fee limit lifted, so a high cost does not hide a
  // wrong deployer, code or fee.
  assertPlatformTx(body.unsignedTransaction, passphrase, platform, {
    ...policy,
    maxFeeStroops: Number.MAX_SAFE_INTEGER,
  });
  report(true, 'a deploy matches the policy the platform key signs under');

  // Trustless Work simulates before it answers, so the fee it asks is the cost.
  const fee = Number(TransactionBuilder.fromXDR(body.unsignedTransaction, passphrase).fee);
  report(
    fee <= MAX_PLATFORM_FEE_STROOPS,
    'a deploy costs less than the limit',
    `${xlm(fee)} XLM (limit ${xlm(MAX_PLATFORM_FEE_STROOPS)})` +
      (fee > MAX_PLATFORM_FEE_STROOPS
        ? '. Ask Trustless Work whether its escrow code needs restoring'
        : ''),
  );
} catch (error) {
  report(false, 'Trustless Work builds a deploy', (error as Error).message);
}

console.log(failures === 0 ? '\nReady.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
