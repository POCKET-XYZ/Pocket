import { findNumbers, mentionsMoney, parseDigits, readBudget, shareOut, textHasNumber } from './numbers';

describe('parseDigits', () => {
  it.each([
    ['300', 300],
    ['1.500', 1500],
    ['1,500', 1500],
    ['1.500.000', 1_500_000],
    ['1,500,000', 1_500_000],
    ['1.500,50', 1500.5],
    ['1,500.50', 1500.5],
    ['12,5', 12.5],
    ['12.5', 12.5],
    ['0,75', 0.75],
  ])('reads %s as %d', (raw, value) => {
    expect(parseDigits(raw)).toBe(value);
  });
});

describe('findNumbers', () => {
  it('reads thousands written with a word or a letter', () => {
    const values = findNumbers('12 mil vistas, 8k likes, 1,2 millones de impresiones y 340 clics').map(
      (found) => found.value,
    );
    expect(values).toEqual([12_000, 8_000, 1_200_000, 340]);
  });

  it('leaves number words out', () => {
    expect(findNumbers('doce mil vistas')).toEqual([]);
  });

  it('finds a number however it was written', () => {
    expect(textHasNumber('el primero llegó a 12.000 vistas', 12_000)).toBe(true);
    expect(textHasNumber('llegó a 12k', 12_000)).toBe(true);
    expect(textHasNumber('llegó a 12 mil', 12_000)).toBe(true);
    expect(textHasNumber('llegó a 12 mil', 1_200)).toBe(false);
  });
});

describe('readBudget', () => {
  it.each([
    ['Tengo 300 USDC para esto', 300],
    ['3 videos en 2 semanas, 300 USDC', 300],
    ['Presupuesto: 1.500', 1500],
    ['presupuesto de 450', 450],
    ['Our budget is $1,500 for the launch', 1500],
    ['Tenho 200 dólares', 200],
    ['US$ 250 en total', 250],
  ])('takes "%s" as a total of %d', (text, amount) => {
    expect(readBudget(text)).toEqual({ kind: 'total', amount });
  });

  it('does not take counts or durations for money', () => {
    expect(readBudget('Quiero 3 videos en 2 semanas para TikTok')).toEqual({ kind: 'none' });
  });

  it('has no budget when none is written', () => {
    expect(readBudget('No sé cuánto cobrar, ayúdame')).toEqual({ kind: 'none' });
  });

  it.each([
    ['Entre 200 y 300 USDC', 'range'],
    ['Máximo 300 USDC', 'range'],
    ['hasta $500', 'range'],
    ['200-300 USD', 'range'],
    ['100 USDC por video, son 3', 'per_unit'],
    ['50 dólares por cada publicación', 'per_unit'],
    ['300 Bs para todo', 'other_currency'],
    ['R$ 500 de orçamento', 'other_currency'],
    ['Tengo 300 USDC, o quizá 400 USDC', 'several'],
  ])('reads "%s" as unclear (%s)', (text, reason) => {
    expect(readBudget(text)).toEqual({ kind: 'unclear', reason });
  });
});

describe('mentionsMoney', () => {
  it.each(['Pago de $300', 'cobras 300 USDC', 'precio 50 dólares', 'USDC', '300 Bs'])(
    'sees money in "%s"',
    (text) => expect(mentionsMoney(text)).toBe(true),
  );

  it.each(['3 videos verticales', 'Llegar a 10 mil vistas', 'Entregar 2 posts por semana'])(
    'sees no money in "%s"',
    (text) => expect(mentionsMoney(text)).toBe(false),
  );
});

describe('shareOut', () => {
  it('shares by weight and always adds up to the total', () => {
    expect(shareOut(300, [1, 2, 1])).toEqual([75, 150, 75]);
    const parts = shareOut(100, [1, 1, 1]);
    expect(parts).toEqual([33.33, 33.33, 33.34]);
    expect(Math.round(parts.reduce((a, b) => a + b, 0) * 100)).toBe(10_000);
  });

  it('gives nothing to share without weights', () => {
    expect(shareOut(100, [])).toEqual([]);
  });
});
