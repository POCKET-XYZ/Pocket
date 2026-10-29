import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { KpiTemplate } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth';
import { PrismaService } from '../../prisma/prisma.service';
import { KpiTemplateDto } from './dto/kpi-template.dto';
import { cleanKpis, type CleanKpi } from './kpis';

/** The most KPI templates a startup can keep. */
export const MAX_KPI_TEMPLATES = 20;

/** A template as the API answers it. */
export interface KpiTemplateView {
  id: string;
  name: string;
  kpis: CleanKpi[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Named sets of KPIs a startup saves and reuses when posting jobs. Private to
 * the startup: anyone else asking for one is told it does not exist.
 */
@Injectable()
export class KpiTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The signed-in startup's templates, by name. */
  async mine(user: AuthUser): Promise<KpiTemplateView[]> {
    assertStartup(user);
    const templates = await this.prisma.kpiTemplate.findMany({
      where: { startupId: user.sub },
      orderBy: { name: 'asc' },
    });
    return templates.map(toView);
  }

  async create(user: AuthUser, dto: KpiTemplateDto): Promise<KpiTemplateView> {
    assertStartup(user);
    const { name, kpis } = clean(dto);
    const existing = await this.prisma.kpiTemplate.findMany({
      where: { startupId: user.sub },
      select: { id: true, name: true },
    });
    if (existing.length >= MAX_KPI_TEMPLATES) {
      throw new BadRequestException(
        `Puedes guardar hasta ${MAX_KPI_TEMPLATES} plantillas. Primero elimina una que ya no uses`,
      );
    }
    assertNameFree(existing, name);
    const template = await this.prisma.kpiTemplate.create({
      data: { startupId: user.sub, name, kpis },
    });
    return toView(template);
  }

  async update(
    user: AuthUser,
    templateId: string,
    dto: KpiTemplateDto,
  ): Promise<KpiTemplateView> {
    await this.owned(user, templateId);
    const { name, kpis } = clean(dto);
    const others = await this.prisma.kpiTemplate.findMany({
      where: { startupId: user.sub, id: { not: templateId } },
      select: { id: true, name: true },
    });
    assertNameFree(others, name);
    const template = await this.prisma.kpiTemplate.update({
      where: { id: templateId },
      data: { name, kpis },
    });
    return toView(template);
  }

  async remove(user: AuthUser, templateId: string): Promise<{ deleted: true }> {
    await this.owned(user, templateId);
    await this.prisma.kpiTemplate.delete({ where: { id: templateId } });
    return { deleted: true };
  }

  /** A template of the signed-in startup. Anyone else's reads as not found. */
  private async owned(user: AuthUser, templateId: string): Promise<KpiTemplate> {
    assertStartup(user);
    const template = await this.prisma.kpiTemplate.findFirst({
      where: { id: templateId, startupId: user.sub },
    });
    if (!template) throw new NotFoundException('No encontramos la plantilla');
    return template;
  }
}

function assertStartup(user: AuthUser): void {
  if (user.role !== 'startup') {
    throw new ForbiddenException('Solo las startups pueden guardar plantillas de KPI');
  }
}

/** The name and KPIs as stored, checked the same way as a job's KPIs. */
function clean(dto: KpiTemplateDto): { name: string; kpis: CleanKpi[] } {
  const name = dto.name.trim();
  if (name.length < 2) {
    throw new BadRequestException(
      'La plantilla necesita un nombre de al menos 2 caracteres',
    );
  }
  const kpis = cleanKpis(dto.kpis);
  if (kpis.length === 0) {
    throw new BadRequestException('La plantilla necesita al menos un KPI');
  }
  return { name, kpis };
}

/** Two templates of one startup never share a name, ignoring case. */
function assertNameFree(others: { name: string }[], name: string): void {
  const key = name.toLowerCase();
  if (others.some((other) => other.name.toLowerCase() === key)) {
    throw new ConflictException(`Ya tienes una plantilla llamada "${name}"`);
  }
}

function toView(template: KpiTemplate): KpiTemplateView {
  return {
    id: template.id,
    name: template.name,
    kpis: template.kpis as unknown as CleanKpi[],
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}
