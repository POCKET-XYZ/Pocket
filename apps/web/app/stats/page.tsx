'use client';

import type { PublicStats } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRightIcon,
  BriefcaseBusinessIcon,
  CircleDollarSignIcon,
  HandCoinsIcon,
  LockIcon,
  RepeatIcon,
  ShieldCheckIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import { ErrorAlert, Loading } from '@/components/page';
import { api } from '@/lib/api';
import { dateTime, explorerAccount } from '@/lib/format';

/**
 * Pocket's traction, for anyone: every number is read from Stellar, so it can
 * be checked on a block explorer without trusting Pocket.
 */
export default function StatsPage() {
  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => api<PublicStats>('/stats'),
    refetchInterval: 5 * 60_000,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <header className="relative overflow-hidden rounded-3xl bg-navy px-6 py-12 text-off-white md:px-12">
        <div className="absolute -right-20 -top-24 size-72 rounded-full bg-celeste/20 blur-3xl" />
        <div className="absolute -bottom-28 right-24 size-72 rounded-full bg-mandarina/15 blur-3xl" />
        <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-celeste">
          {stats.data?.network === 'mainnet'
            ? 'Red principal de Stellar'
            : stats.data
              ? 'Red de pruebas de Stellar'
              : 'Stellar'}
        </p>
        <h1 className="relative mt-3 text-4xl font-bold md:text-5xl">
          Pocket en números
        </h1>
        <p className="relative mt-4 max-w-2xl text-off-white/80">
          Cada pago en Pocket espera en un contrato en Stellar hasta que se aprueba el
          trabajo. Estos números se leen directamente de esos contratos, no de nuestra
          base de datos: cualquiera los puede comprobar.
        </p>
        {stats.data ? (
          <a
            href={explorerAccount(stats.data.platformAddress)}
            target="_blank"
            rel="noreferrer"
            className="relative mt-6 inline-flex items-center gap-1 rounded-full bg-mandarina px-4 py-2 text-sm font-semibold text-navy transition hover:bg-mandarina/85"
          >
            Comprobar cada número en Stellar
            <ArrowUpRightIcon className="size-4" aria-hidden />
          </a>
        ) : null}
      </header>

      {stats.error ? (
        <ErrorAlert error={stats.error} title="No pudimos leer los números" />
      ) : !stats.data ? (
        <Loading label="Leyendo la red" />
      ) : (
        <Figures data={stats.data} />
      )}
    </div>
  );
}

function Figures({ data }: { data: PublicStats }) {
  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <BigFigure
          icon={CircleDollarSignIcon}
          label="USDC depositados en contratos"
          value={money(data.funded)}
          unit="USDC"
          hint="Todo lo que las startups guardaron para pagar trabajos."
        />
        <BigFigure
          icon={HandCoinsIcon}
          label="USDC liberados"
          value={money(data.released)}
          unit="USDC"
          hint="Pagos de hitos aprobados y disputas resueltas."
        />
        <BigFigure
          icon={LockIcon}
          label="Guardados ahora"
          value={money(data.inEscrows)}
          unit="USDC"
          hint="Esperando que se apruebe el trabajo."
        />
      </section>

      <section className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <SmallFigure
          icon={BriefcaseBusinessIcon}
          label="Contratos protegidos"
          value={count(data.escrows)}
        />
        <SmallFigure
          icon={ShieldCheckIcon}
          label="Hitos pagados"
          value={count(data.milestonesReleased)}
        />
        <SmallFigure
          icon={UsersIcon}
          label="Startups y expertos activos"
          value={`${count(data.wallets.startups)} y ${count(data.wallets.specialists)}`}
        />
        <SmallFigure
          icon={RepeatIcon}
          label="Recontrataciones"
          value={count(data.repeatHires)}
        />
      </section>

      <section className="grid gap-6 rounded-2xl border border-border bg-card p-6 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-bold text-navy">Cómo se leen</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              Cada contrato de Pocket es un contrato en Stellar que nombra a la cuenta de
              Pocket. Lo depositado es lo que guarda hoy más lo que ya salió de él.
            </li>
            <li>
              Lo liberado es la suma de los hitos pagados y las disputas resueltas, con
              las comisiones incluidas.
            </li>
            <li>
              Las startups activas son las cuentas que depositaron en un contrato; los
              expertos activos, las que fueron contratadas en uno. Una recontratación es
              un contrato de una startup que ya había contratado antes.
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-bold text-navy">Comisión de Pocket</h2>
          <p className="mt-3 font-heading text-3xl font-bold text-navy tabular-nums">
            {money(data.feesCollected)}
            <span className="ml-2 font-sans text-base font-normal text-muted-foreground">
              USDC
            </span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            El 1% de cada pago, que el contrato envía a la cuenta de Pocket. Se ve en el
            historial de esa cuenta.
          </p>
          <a
            href={explorerAccount(data.platformAddress)}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-navy underline"
          >
            Ver la cuenta de Pocket en stellar.expert
            <ArrowUpRightIcon className="size-4" aria-hidden />
          </a>
        </div>
      </section>

      <p className="text-center text-xs text-muted-foreground">
        Actualizado el {dateTime(data.updatedAt)}. Se vuelve a leer de la red cada pocos
        minutos.
      </p>
    </>
  );
}

function BigFigure({
  icon: Icon,
  label,
  value,
  unit,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
  hint: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="flex size-8 items-center justify-center rounded-lg bg-celeste-light/70 text-navy">
          <Icon className="size-4" aria-hidden />
        </span>
        {label}
      </div>
      <p className="mt-3 font-heading text-4xl font-bold tracking-tight text-navy tabular-nums wrap-anywhere">
        {value}
        <span className="ml-2 font-sans text-base font-medium text-muted-foreground">
          {unit}
        </span>
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function SmallFigure({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-celeste-light/70 text-navy">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-1 font-heading text-2xl leading-tight font-bold text-navy tabular-nums wrap-anywhere">
        {value}
      </p>
    </div>
  );
}

function money(amount: string): string {
  return Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function count(value: number): string {
  return value.toLocaleString('en-US');
}
