import { rolesOf, withRole } from './roles';

describe('roles', () => {
  it('reads an account from before combined roles as its one role', () => {
    expect(rolesOf({ role: 'startup', roles: [] })).toEqual(['startup']);
    expect(rolesOf({ role: 'specialist', roles: ['startup', 'specialist'] })).toEqual([
      'startup',
      'specialist',
    ]);
  });

  it('adds a marketplace role once, and never carries a manager role along', () => {
    expect(withRole({ role: 'startup', roles: [] }, 'specialist')).toEqual([
      'startup',
      'specialist',
    ]);
    expect(
      withRole({ role: 'startup', roles: ['startup', 'specialist'] }, 'specialist'),
    ).toEqual(['startup', 'specialist']);
    expect(withRole({ role: 'specialist', roles: ['manager'] }, 'startup')).toEqual([
      'startup',
    ]);
  });
});
