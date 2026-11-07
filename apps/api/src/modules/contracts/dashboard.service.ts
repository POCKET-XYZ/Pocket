import { Injectable, NotFoundException } from '@nestjs/common';
import type { SpecialistDashboard, StartupDashboard, TrackRecord } from '@pocket/shared';
import type { AuthUser } from '../../common/types/auth';
import { PrismaService } from '../../prisma/prisma.service';
import { DASHBOARD_INCLUDE, specialistDashboard, startupDashboard } from './dashboard';
import { TRACK_RECORD_INCLUDE, trackRecordOf } from './track-record';

/** What each party has spent, earned and got done, added up over their contracts. */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async startup(user: AuthUser): Promise<StartupDashboard> {
    const contracts = await this.prisma.contract.findMany({
      where: { startupId: user.sub },
      include: DASHBOARD_INCLUDE,
    });
    return startupDashboard(contracts, new Date());
  }

  async specialist(user: AuthUser): Promise<SpecialistDashboard> {
    const contracts = await this.prisma.contract.findMany({
      where: { specialistId: user.sub },
      include: DASHBOARD_INCLUDE,
    });
    return specialistDashboard(contracts, new Date());
  }

  /** Public, like the profile it is shown on: only for an approved specialist. */
  async trackRecord(userId: string): Promise<TrackRecord> {
    const specialist = await this.prisma.user.findFirst({
      where: {
        id: userId,
        role: 'specialist',
        verificationStatus: 'approved',
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!specialist) throw new NotFoundException('No encontramos este perfil');
    const contracts = await this.prisma.contract.findMany({
      where: { specialistId: userId, status: 'completed' },
      include: TRACK_RECORD_INCLUDE,
    });
    return trackRecordOf(contracts, new Date());
  }
}
