import { Reveal } from '@/components/reveal';

const paths = [
  {
    name: 'Equipo técnico',
    gap: 'Construye el producto, pero nadie del equipo sabe venderlo.',
  },
  {
    name: 'Agencia',
    gap: 'Sabe de growth, pero cuesta más de lo que una startup temprana puede pagar.',
  },
  {
    name: 'Freelancer',
    gap: 'Es accesible, pero nadie garantiza que entregue ni que cobre.',
  },
];

export function Why() {
  return (
    <section className="py-24 md:py-36">
      <Reveal className="wrap" stagger>
        <h2 className="headline-lg max-w-3xl">Tres caminos, ninguno alcanza.</h2>
        <ul className="mt-14 grid gap-px overflow-hidden rounded-2xl bg-off-white/15 md:grid-cols-3">
          {paths.map((path) => {
            const last = path.name === 'Freelancer';
            return (
              <li
                key={path.name}
                className={`flex flex-col gap-3 p-8 ${last ? 'bg-celeste/15' : 'bg-navy'}`}
              >
                <h3 className="headline-md">{path.name}</h3>
                <p className={last ? 'text-off-white/90' : 'text-muted'}>{path.gap}</p>
              </li>
            );
          })}
        </ul>
        <p className="mt-12 text-xl text-celeste md:text-2xl">
          Y ahí aparece la primera barrera.
        </p>
      </Reveal>
    </section>
  );
}
