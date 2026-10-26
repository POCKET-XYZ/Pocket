const facts = [
  { value: 'USDC', label: 'Se paga en dólares digitales, sin volatilidad.' },
  { value: '< 1¢', label: 'Cuesta cada operación en Stellar.' },
  {
    value: '0 %',
    label: 'Cobra Pocket en el MVP. Trustless Work cobra 0.3 % por operación en mainnet.',
  },
];

const arrow = (
  <li aria-hidden className="self-center text-2xl text-celeste">
    <span className="hidden md:inline">⟶</span>
    <span className="md:hidden">↓</span>
  </li>
);

const render = (name: string) => (
  <img
    src={`/renders/${name}.webp`}
    alt=""
    width={640}
    height={640}
    loading="lazy"
    className="size-16 shrink-0"
  />
);

export function NonCustodial() {
  return (
    <section className="py-24 md:py-36">
      <div className="wrap">
        <h2 className="headline-lg max-w-3xl">Pocket nunca toca el dinero.</h2>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          La startup firma el fondeo y la aprobación desde su wallet. Pocket solo puede
          liberar el pago hacia la wallet del specialist fijada en el escrow.
        </p>
        <ol className="mt-14 flex flex-col items-stretch gap-3 md:flex-row md:items-center">
          <li className="flex flex-1 items-center gap-4 rounded-2xl border border-off-white/20 p-6">
            {render('wallet')}
            <div>
              <p className="font-heading text-xl font-bold">Wallet de la startup</p>
              <p className="mt-1 text-sm text-muted">Firma y fondea</p>
            </div>
          </li>
          {arrow}
          <li className="flex flex-1 items-center gap-4 rounded-2xl border-2 border-celeste bg-celeste/10 p-6">
            {render('lock')}
            <div>
              <p className="font-heading text-xl font-bold">Escrow en Stellar</p>
              <p className="mt-1 text-sm text-muted">Trustless Work guarda los USDC</p>
            </div>
          </li>
          {arrow}
          <li className="flex flex-1 items-center gap-4 rounded-2xl border border-off-white/20 p-6">
            {render('badge')}
            <div>
              <p className="font-heading text-xl font-bold">Wallet del specialist</p>
              <p className="mt-1 text-sm text-muted">Recibe al aprobar</p>
            </div>
          </li>
        </ol>
        <dl className="mt-16 grid gap-10 md:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.value}>
              <dt className="headline-lg text-celeste">{fact.value}</dt>
              <dd className="mt-2 max-w-xs text-muted">{fact.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
