import { Reveal } from '@/components/reveal';

export function Problem() {
  return (
    <section className="bg-off-white py-24 text-navy md:py-36">
      <Reveal className="wrap" stagger>
        <h2 className="headline-lg max-w-3xl">Buen producto no alcanza.</h2>
        <p className="mt-6 max-w-2xl text-xl text-navy/75 md:text-2xl">
          Muchas startups construyen un buen producto, pero no tienen quién lo lleve al
          mercado ni sepa explicarlo.
        </p>
        <dl className="mt-16 grid gap-12 border-t border-navy/15 pt-12 md:grid-cols-2">
          <div>
            <dt className="sr-only">Personas con cripto que no la usan on-chain</dt>
            <dd className="headline-xl">9 de 10</dd>
            <dd className="mt-3 max-w-sm text-navy/75">
              personas que tienen cripto no la usan on-chain. 716 M de dueños contra 40–70
              M de usuarios activos al mes.
            </dd>
          </div>
          <div>
            <dt className="sr-only">Startups que fracasan por marketing deficiente</dt>
            <dd className="headline-xl">14 %</dd>
            <dd className="mt-3 max-w-sm text-navy/75">
              de los post-mortems de startups citan un marketing deficiente como causa del
              cierre.
            </dd>
          </div>
        </dl>
        <p className="mt-12 text-sm text-navy/75">
          Fuentes:{' '}
          <a
            href="https://a16zcrypto.com/posts/article/state-of-crypto-report-2025/"
            className="underline underline-offset-2"
          >
            a16z crypto, State of Crypto 2025
          </a>{' '}
          ·{' '}
          <a
            href="https://s3-us-west-2.amazonaws.com/cbi-content/research-reports/The-20-Reasons-Startups-Fail.pdf"
            className="underline underline-offset-2"
          >
            CB Insights, The 20 Reasons Startups Fail
          </a>
        </p>
      </Reveal>
    </section>
  );
}
