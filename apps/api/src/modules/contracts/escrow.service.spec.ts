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
  platformFee: 0n,
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
          platformFee: 0,
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
