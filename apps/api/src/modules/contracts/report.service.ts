import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ContractReport, PeriodReport } from '@pocket/shared';
import type { AuthUser } from '../../common/types/auth';
import type { PrivateFile } from '../../common/uploads/send-file';
import { PrismaService } from '../../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { assertCanView } from './contracts.service';
import { PayoutsService } from './payouts.service';
import type { PeriodQueryDto } from './dto/period-query.dto';
import { periodCsv, periodOf, periodReport } from './period-report';
import { buildReport, REPORT_INCLUDE, reportCsv } from './report';

/** The results report of a contract, for its parties and managers. */
@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payouts: PayoutsService,
    private readonly stellar: StellarService,
  ) {}

  async report(user: AuthUser, contractId: string): Promise<ContractReport> {
    const access = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: { startupId: true, specialistId: true },
    });
    if (!access) throw new NotFoundException('No encontramos el contrato');
    assertCanView(user, access);

    // Payments whose split was not read yet (Horizon was behind or down when
    // they were confirmed) are read now, so the report shows them.
    await this.payouts.readMissing(contractId);
    const source = await this.prisma.contract.findUniqueOrThrow({
      where: { id: contractId },
      include: REPORT_INCLUDE,
    });
    return buildReport(source, new Date());
  }

  /** What a startup or a specialist did in a period, across their contracts. */
  async period(user: AuthUser, query: PeriodQueryDto): Promise<PeriodReport> {
    const now = new Date();
    let period: ReturnType<typeof periodOf>;
    try {
      period = periodOf(query.from, query.to, now);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const role = user.role === 'startup' ? 'startup' : 'specialist';
    const mine =
      role === 'startup' ? { startupId: user.sub } : { specialistId: user.sub };
    const unread = await this.prisma.contract.findMany({
      where: {
        ...mine,
        chainOperations: {
          some: {
            status: 'confirmed',
            kind: { in: ['release', 'resolve'] },
            payoutsReadAt: null,
          },
        },
      },
      select: { id: true },
    });
    // Like the contract's report: a split not read yet is read now.
    for (const { id } of unread) await this.payouts.readMissing(id);

    const [sources, profile] = await Promise.all([
      this.prisma.contract.findMany({
        where: { ...mine, fundedAt: { not: null } },
        include: REPORT_INCLUDE,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.sub },
        select: {
          startupProfile: { select: { companyName: true } },
          specialistProfile: { select: { displayName: true } },
        },
      }),
    ]);
    const name =
      role === 'startup'
        ? (profile.startupProfile?.companyName ?? null)
        : (profile.specialistProfile?.displayName ?? null);
    return periodReport(sources, { id: user.sub, role, name }, period, now);
  }

  /** The period's payments as a CSV file. */
  async periodCsv(user: AuthUser, query: PeriodQueryDto): Promise<PrivateFile> {
    const report = await this.period(user, query);
    const csv = periodCsv(
      report,
      this.stellar.network === 'mainnet' ? 'public' : 'testnet',
    );
    return {
      data: Buffer.from(csv, 'utf8'),
      contentType: 'text/csv',
      fileName: `pocket-pagos-${report.from}-a-${report.to}.csv`,
    };
  }

  /** The report's payments as a CSV file. */
  async csv(user: AuthUser, contractId: string): Promise<PrivateFile> {
    const report = await this.report(user, contractId);
    const csv = reportCsv(
      report,
      this.stellar.network === 'mainnet' ? 'public' : 'testnet',
    );
    return {
      data: Buffer.from(csv, 'utf8'),
      contentType: 'text/csv',
      fileName: `pocket-pagos-${contractId.slice(0, 8)}.csv`,
    };
  }
}
