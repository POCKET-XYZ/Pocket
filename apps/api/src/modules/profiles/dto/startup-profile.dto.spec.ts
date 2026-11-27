import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { StartupProfileDto } from './startup-profile.dto';

const BASE = {
  companyName: 'La Cocina de Ana',
  oneLiner: 'Restaurante de comida casera en San José',
  sector: 'Restaurantes',
  lookingFor: 'Alguien que nos ayude a llenar el local entre semana',
};

function problems(body: object): string[] {
  return validateSync(plainToInstance(StartupProfileDto, { ...BASE, ...body })).map(
    (error) => error.property,
  );
}

describe('StartupProfileDto', () => {
  it('takes a profile with no stage, website or social network', () => {
    expect(problems({})).toEqual([]);
  });

  it('takes a main social network with its link', () => {
    expect(
      problems({ socialPlatform: 'instagram', socialUrl: 'https://instagram.com/ana' }),
    ).toEqual([]);
  });

  it('asks which network a social link is from', () => {
    expect(problems({ socialUrl: 'https://instagram.com/ana' })).toEqual([
      'socialPlatform',
    ]);
  });

  it('turns down a network it does not know and a link that is not https', () => {
    expect(
      problems({ socialPlatform: 'myspace', socialUrl: 'http://x.com/ana' }),
    ).toEqual(['socialPlatform', 'socialUrl']);
  });
});
