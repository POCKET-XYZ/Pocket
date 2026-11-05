import {
  POCKET_FEE_PERCENT,
  TRUSTLESS_WORK_FEE_PERCENT,
  feeBreakdown,
} from '@pocket/shared';
import { usdc } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * What the fees take from a set of payouts, line by line, so nobody has to do
 * the math. Each fee is charged on each payout as it is released.
 */
export function FeeBreakdown({
  amounts,
  totalLabel,
  netLabel,
  className,
}: {
  /** One amount per payout: each milestone is charged on its own. */
  amounts: (string | number)[];
  /** The first line, for example "Monto de tu propuesta". */
  totalLabel: string;
  /** The last line, for example "Recibes en total". */
  netLabel: string;
  className?: string;
}) {
  const lines = feeBreakdown(amounts);
  return (
    <div className={cn('space-y-2 text-sm', className)}>
      {/* Amounts never wrap: "-0.009" and "USDC" belong on one line. */}
      <table className="w-full max-w-md">
        <tbody className="[&_td]:py-1">
          <tr>
            <td>{totalLabel}</td>
            <td className="whitespace-nowrap text-right tabular-nums">
              {usdc(lines.total)}
            </td>
          </tr>
          <tr className="text-muted-foreground">
            <td>Comisión de Pocket ({POCKET_FEE_PERCENT}%)</td>
            <td className="whitespace-nowrap text-right tabular-nums">
              -{usdc(lines.pocket)}
            </td>
          </tr>
          <tr className="text-muted-foreground">
            <td>
              Comisión del pago protegido ({TRUSTLESS_WORK_FEE_PERCENT}%)
              <span className="block text-xs">Trustless Work, que opera el contrato</span>
            </td>
            <td className="whitespace-nowrap text-right align-top tabular-nums">
              -{usdc(lines.trustlessWork)}
            </td>
          </tr>
          <tr className="border-t border-border font-semibold text-navy">
            <td className="pt-2">{netLabel}</td>
            <td className="pt-2 whitespace-nowrap text-right tabular-nums">
              {usdc(lines.net)}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        El pago queda protegido en un contrato hasta que se aprueba cada hito, y se cobra
        al liberar cada pago.
        {amounts.length > 1 ? ' El total se recibe conforme se aprueban los hitos.' : ''}
      </p>
    </div>
  );
}
