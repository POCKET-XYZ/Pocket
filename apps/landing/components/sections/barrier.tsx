export function Barrier() {
  return (
    <section className="bg-yellow py-24 text-navy md:py-36">
      <div className="wrap">
        <h2 className="headline-xl max-w-4xl">La primera barrera es la confianza.</h2>
        <div className="mt-16 grid gap-12 md:grid-cols-2">
          <figure className="border-l-4 border-navy pl-6">
            <figcaption className="font-medium text-navy/70">
              La startup se pregunta
            </figcaption>
            <blockquote className="headline-lg mt-3">
              ¿Y si pago y no entregan?
            </blockquote>
          </figure>
          <figure className="border-l-4 border-navy pl-6">
            <figcaption className="font-medium text-navy/70">
              El specialist se pregunta
            </figcaption>
            <blockquote className="headline-lg mt-3">
              ¿Y si trabajo y no me pagan?
            </blockquote>
          </figure>
        </div>
      </div>
    </section>
  );
}
