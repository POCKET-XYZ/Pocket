import { Keypair } from '@stellar/stellar-sdk';
import { parseManagerList, syncManagers } from './sync-managers';

const ANA = Keypair.random().publicKey();
const BRUNO = Keypair.random().publicKey();
const FORMER = Keypair.random().publicKey();

describe('parseManagerList', () => {
  it('trims, drops blanks and repeats', () => {
    expect(parseManagerList(` ${ANA}, ,${BRUNO},${ANA} `)).toEqual([ANA, BRUNO]);
  });

  it('reads an unset variable as an empty list', () => {
    expect(parseManagerList(undefined)).toEqual([]);
  });
});

describe('syncManagers', () => {
  let prisma: {
    user: { upsert: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
  };
  const log = jest.fn();

  beforeEach(() => {
    log.mockReset();
    prisma = {
      user: {
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
  });

  it('makes every listed address an approved manager', async () => {
    await syncManagers(prisma, [ANA, BRUNO], log);
    expect(prisma.user.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { stellarAddress: ANA },
      create: { stellarAddress: ANA, role: 'manager', verificationStatus: 'approved' },
      update: { role: 'manager', verificationStatus: 'approved' },
    });
  });

  it('demotes managers who are not on the list and ends their sessions', async () => {
    prisma.user.findMany.mockResolvedValue([{ stellarAddress: FORMER }]);

    const result = await syncManagers(prisma, [ANA], log);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: 'manager', stellarAddress: { notIn: [ANA] } },
      select: { stellarAddress: true },
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { role: 'manager', stellarAddress: { in: [FORMER] } },
      data: {
        role: 'specialist',
        verificationStatus: 'rejected',
        tokenVersion: { increment: 1 },
      },
    });
    expect(result.demoted).toEqual([FORMER]);
    // Listed managers are in place before anyone is demoted.
    expect(prisma.user.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.user.updateMany.mock.invocationCallOrder[0],
    );
  });

  it('demotes nobody when every manager is still listed', async () => {
    await syncManagers(prisma, [ANA], log);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('touches nothing and warns when the list is empty', async () => {
    const result = await syncManagers(prisma, [], log);
    expect(result.skipped).toBe(true);
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('WARNING'));
  });

  it('writes nothing when one address is invalid', async () => {
    await expect(syncManagers(prisma, [ANA, 'GNOTANADDRESS'], log)).rejects.toThrow(
      'GNOTANADDRESS',
    );
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
