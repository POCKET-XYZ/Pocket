import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ChainOperationsService } from '../stellar/chain-operations.service';
import type { ChainEscrow, SorobanReader } from '../stellar/soroban-reader.service';
import type { StellarService } from '../stellar/stellar.service';
import type { TrustlessWorkClient } from '../stellar/trustless-work.client';
import { EscrowService } from './escrow.service';

const WASM = 'ab'.repeat(32);

/** The escrow the chain holds after a correct deploy of `input`. */
const onChain = (): ChainEscrow => ({
  engagementId: 'contract-1',
  roles: {
    approver: 'GSTARTUP',
    service_provider: 'GSPECIALIST',
    platform: 'GPOCKET',
    release_signer: 'GPOCKET',
    dispute_resolver: 'GPOCKET',
  },
  trustline: 'CUSDC',
  // Pocket's 1%, in basis points.
  platformFee: 100n,
  milestones: [
    { amount: 4_505_000_000n, receiver: 'GSPECIALIST', flags: untouched() },
    { amount: 495_000_000n, receiver: 'GSPECIALIST', flags: untouched() },
  ],
});
const untouched = () => ({ approved: false, released: false, disputed: false, resolved: false });

describe('EscrowService', () => {
  let trustlessWork: { deployMultiRelease: jest.Mock; escrowWasmHash: string };
  let operations: { executeAsPlatform: jest.Mock; markFailed: jest.Mock };
  let chain: { wasmHash: jest.Mock; escrow: jest.Mock; usdcBalance: jest.Mock };
  let service: EscrowService;

  const input = {
    contract: { id: 'contract-1' },
    title: 'Fix our outbound funnel',
    description: 'Scope',
    milestones: [
      { position: 1, title: 'Report', amount: new Prisma.Decimal('49.5') },
      { position: 0, title: 'Lead list', amount: new Prisma.Decimal('450.5') },
    ],
    startupAddress: 'GSTARTUP',
    specialistAddress: 'GSPECIALIST',
  };

  beforeEach(() => {
    trustlessWork = {
      deployMultiRelease: jest.fn().mockResolvedValue('unsigned-xdr'),
      escrowWasmHash: WASM,
    };
    operations = {
      // Stands in for the platform check, which fills in the derived address.
      executeAsPlatform: jest.fn(
        (_scope: unknown, _xdr: string, policy: { escrowAddress: () => string }) => {
          jest.spyOn(policy, 'escrowAddress').mockReturnValue('CESCROW');
          return Promise.resolve({
            operation: { id: 'op-1', txHash: 'hash-1' },
            contractId: 'CESCROW',
          });
        },
      ),
      markFailed: jest.fn(),
    };
    chain = {
      wasmHash: jest.fn().mockResolvedValue(WASM),
      escrow: jest.fn().mockResolvedValue(onChain()),
      usdcBalance: jest.fn(),
    };
    service = new EscrowService(
      {
        platformAddress: 'GPOCKET',
        usdcIssuer: 'GUSDC',
        usdcContractId: 'CUSDC',
      } as unknown as StellarService,
      trustlessWork as unknown as TrustlessWorkClient,
      operations as unknown as ChainOperationsService,
      chain as unknown as SorobanReader,
    );
  });

  describe('deploy', () => {
    it('gives the startup approval, pays the specialist and keeps the platform roles for Pocket', async () => {
      await expect(service.deploy(input)).resolves.toBe('CESCROW');
      expect(trustlessWork.deployMultiRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          signer: 'GPOCKET',
          engagementId: 'contract-1',
          roles: {
            approver: 'GSTARTUP',
            serviceProvider: 'GSPECIALIST',
            platformAddress: 'GPOCKET',
            releaseSigner: 'GPOCKET',
            disputeResolver: 'GPOCKET',
          },
          platformFee: 1,
          milestones: [
            { description: 'Lead list', amount: 450.5, receiver: 'GSPECIALIST' },
            { description: 'Report', amount: 49.5, receiver: 'GSPECIALIST' },
          ],
          trustline: { address: 'GUSDC', symbol: 'USDC' },
        }),
      );
    });

    it.each([
      ['runs other code', () => chain.wasmHash.mockResolvedValue('cd'.repeat(32))],
      ['is not on chain', () => chain.escrow.mockResolvedValue(null)],
      [
        'pays someone else',
        () => {
          const escrow = onChain();
          escrow.milestones[1].receiver = 'GTHIEF';
          chain.escrow.mockResolvedValue(escrow);
        },
      ],
      [
        'has another approver',
        () => chain.escrow.mockResolvedValue({ ...onChain(), roles: { ...onChain().roles, approver: 'GTHIEF' } }),
      ],
      ['charges no fee', () => chain.escrow.mockResolvedValue({ ...onChain(), platformFee: 0n })],
      ['charges 2%', () => chain.escrow.mockResolvedValue({ ...onChain(), platformFee: 200n })],
      ['charges 1% read as a percent', () => chain.escrow.mockResolvedValue({ ...onChain(), platformFee: 1n })],
      ['holds another asset', () => chain.escrow.mockResolvedValue({ ...onChain(), trustline: 'CEURC' })],
      [
        'asks for another amount',
        () => {
          const escrow = onChain();
          escrow.milestones[0].amount = 1n;
          chain.escrow.mockResolvedValue(escrow);
        },
      ],
    ])('refuses an escrow that %s, and frees the step', async (_label, arrange) => {
      arrange();
      await expect(service.deploy(input)).rejects.toBeInstanceOf(ConflictException);
      expect(operations.markFailed).toHaveBeenCalledWith('hash-1', expect.any(Error));
    });

    it('keeps the address it derived, not the one Trustless Work reports', async () => {
      operations.executeAsPlatform.mockImplementation(
        (_scope: unknown, _xdr: string, policy: { escrowAddress: () => string }) => {
          jest.spyOn(policy, 'escrowAddress').mockReturnValue('CESCROW');
          return Promise.resolve({ operation: { txHash: 'hash-1' }, contractId: 'CSOMEWHERE' });
        },
      );
      await expect(service.deploy(input)).resolves.toBe('CESCROW');
    });
  });

  describe.each([
    ['testnet', 'GTWFEE', ['GPOCKET', 'GTWFEE', 1], ['GPOCKET', 1]],
    ['mainnet', undefined, ['GPOCKET', 1], ['GPOCKET', 'GTWFEE', 1]],
  ] as const)('release on %s', (network, feeAddress, accepted, refused) => {
    const contract = { id: 'contract-1', escrowId: 'CESCROW' };
    const milestone = { id: 'm-2', position: 1, amount: new Prisma.Decimal('49.5') };

    /** The service for `network`, returning the policy the platform would sign with. */
    async function policyFor(
      act: (service: EscrowService) => Promise<unknown>,
    ): Promise<{ checkArgs: (args: unknown[]) => void }> {
      const signed = jest.fn().mockResolvedValue({ operation: { id: 'op-2' } });
      const networkService = new EscrowService(
        { platformAddress: 'GPOCKET', network } as unknown as StellarService,
        {
          release: jest.fn().mockResolvedValue('release-xdr'),
          resolve: jest.fn().mockResolvedValue('resolve-xdr'),
          feeAddress,
        } as unknown as TrustlessWorkClient,
        { executeAsPlatform: signed } as unknown as ChainOperationsService,
        chain as unknown as SorobanReader,
      );
      await act(networkService);
      return signed.mock.calls[0][2] as { checkArgs: (args: unknown[]) => void };
    }

    it(`signs the ${network} call shape only`, async () => {
      const policy = await policyFor((s) => s.release(contract, milestone));
      expect(() => policy.checkArgs([...accepted])).not.toThrow();
      expect(() => policy.checkArgs([...refused])).toThrow('unexpected shape');
    });

    it(`resolves with the ${network} call shape only`, async () => {
      const policy = await policyFor((s) =>
        s.resolve(contract, milestone, [
          { address: 'GSPECIALIST', amount: new Prisma.Decimal('40') },
          { address: 'GSTARTUP', amount: new Prisma.Decimal('9.5') },
        ]),
      );
      const distribution = { GSPECIALIST: 400_000_000n, GSTARTUP: 95_000_000n };
      const shape = (args: readonly unknown[]) => [
        args[0],
        args[args.length - 1],
        ...args.slice(1, -1),
        distribution,
      ];
      expect(() => policy.checkArgs(shape(accepted))).not.toThrow();
      expect(() => policy.checkArgs(shape(refused))).toThrow('unexpected shape');
      // The parties and amounts are still checked on either network.
      expect(() =>
        policy.checkArgs([...shape(accepted).slice(0, -1), { GTHIEF: 495_000_000n }]),
      ).toThrow();
    });
  });

  describe('isFunded', () => {
    const contract = { escrowId: 'CESCROW', amount: new Prisma.Decimal('500') };

    it('asks the USDC contract how much the escrow holds', async () => {
      chain.usdcBalance.mockResolvedValue(5_000_000_000n);
      await expect(service.isFunded(contract)).resolves.toBe(true);
      expect(chain.usdcBalance).toHaveBeenCalledWith('CESCROW');
    });

    it('is not funded one stroop short', async () => {
      chain.usdcBalance.mockResolvedValue(4_999_999_999n);
      await expect(service.isFunded(contract)).resolves.toBe(false);
    });
  });
});
