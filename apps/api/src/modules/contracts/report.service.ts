import { Injectable, NotFoundException } from '@nestjs/common';
import type { ContractReport } from '@pocket/shared';
import type { AuthUser } from '../../common/types/auth';
import type { PrivateFile } from '../../common/uploads/send-file';
import { PrismaService } from '../../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { assertCanView } from './contracts.service';
import { PayoutsService } from './payouts.service';
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
